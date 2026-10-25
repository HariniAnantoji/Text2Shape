import json
import unittest
import unittest.mock
from io import BytesIO
from urllib.error import HTTPError
from unittest.mock import patch

from ai_cad import CADOperation, CADPlan, LocalModelError, apply_cad_plan, request_cad_plan
from cad_generator import BaseplateParams, BoxFeature, HoleFeature, ImportedMesh


class CADPlanTests(unittest.TestCase):
    def setUp(self):
        self.params = BaseplateParams()

    def test_adds_primitive_on_top_when_position_is_omitted(self):
        result = apply_cad_plan(
            CADPlan(
                reply="Added a box.",
                operations=[
                    CADOperation(
                        action="add_primitive",
                        shape="box",
                        length=30,
                        width=20,
                        height=10,
                    )
                ],
            ),
            self.params,
            [],
            [],
        )
        self.assertEqual(result.status, "generated")
        self.assertEqual(len(result.features), 1)
        self.assertEqual(result.features[0].z, 9)

    def test_scales_a_feature_without_mutating_original(self):
        original = BoxFeature(id="box-1", shape="box", length=10, width=20, height=30)
        result = apply_cad_plan(
            CADPlan(
                reply="Doubled feature 1.",
                operations=[CADOperation(action="update_primitive", target_index=1, scale_factor=2)],
            ),
            self.params,
            [original],
            [],
        )
        self.assertEqual(
            (result.features[0].length, result.features[0].width, result.features[0].height),
            (20, 40, 60),
        )
        self.assertEqual((original.length, original.width, original.height), (10, 20, 30))

    def test_adds_and_removes_extra_holes(self):
        original = HoleFeature(id="hole-1", x=2, y=3, diameter=4)
        added = apply_cad_plan(
            CADPlan(
                reply="Added a hole.",
                operations=[CADOperation(action="add_hole", x=0, y=0, diameter=6)],
            ),
            self.params,
            [],
            [],
        )
        removed = apply_cad_plan(
            CADPlan(
                reply="Removed the hole.",
                operations=[CADOperation(action="remove_hole", target_index=1)],
            ),
            self.params,
            [],
            [original],
        )
        self.assertEqual(added.holes[0].diameter, 6)
        self.assertEqual(removed.holes, [])

    def test_rejects_invalid_plan_without_partially_applying(self):
        original = BoxFeature(id="box-1", shape="box", length=10, width=20, height=30)
        result = apply_cad_plan(
            CADPlan(
                reply="Change the box.",
                operations=[
                    CADOperation(action="remove_primitive", target_index=1),
                    CADOperation(action="update_primitive", target_index=1, length=-1),
                ],
            ),
            self.params,
            [original],
            [],
        )
        self.assertEqual(result.status, "clarification")
        self.assertEqual(result.features, [original])

    def test_moves_and_scales_imported_mesh(self):
        imported_mesh = ImportedMesh(
            id="a" * 32,
            filename="part.stl",
            length=10,
            width=20,
            height=30,
        )
        result = apply_cad_plan(
            CADPlan(
                reply="Moved and scaled the imported mesh.",
                operations=[
                    CADOperation(
                        action="update_imported_mesh",
                        x=25,
                        scale_factor=2,
                    )
                ],
            ),
            self.params,
            [],
            [],
            imported_mesh,
        )
        self.assertEqual(result.status, "generated")
        self.assertEqual(result.imported_mesh.x, 25)
        self.assertEqual(result.imported_mesh.scale_factor, 2)
        self.assertEqual(imported_mesh.scale_factor, 1)


class LocalModelClientTests(unittest.TestCase):
    def test_parses_ollama_structured_response_without_credentials(self):
        response_body = {
            "message": {
                "content": json.dumps(
                    {
                        "reply": "Added the requested box.",
                        "operations": [
                            {
                                "action": "add_primitive",
                                "shape": "box",
                                "length": 30,
                                "width": 20,
                                "height": 10,
                            }
                        ],
                    }
                )
            }
        }
        mock_response = BytesIO(json.dumps(response_body).encode())
        mock_response.__enter__ = lambda response: response
        mock_response.__exit__ = lambda response, *args: None
        with patch.dict("os.environ", {}, clear=True):
            with patch("cad_plan.urlopen", return_value=mock_response) as urlopen:
                plan = request_cad_plan("Add a box", BaseplateParams(), [], [])

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://localhost:11434/api/chat")
        self.assertNotIn("Authorization", request.headers)
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "qwen2.5:7b")
        self.assertFalse(payload["stream"])
        self.assertFalse(payload["think"])
        self.assertEqual(payload["format"], "json")
        self.assertEqual(plan.reply, "Added the requested box.")
        self.assertEqual(plan.operations[0].shape, "box")

    def test_reports_model_errors(self):
        error = HTTPError(
            "http://localhost:11434/api/chat",
            404,
            "Not Found",
            {},
            BytesIO(b'{"error":"model not found"}'),
        )
        with patch("cad_plan.urlopen", side_effect=error):
            with self.assertRaisesRegex(LocalModelError, "model not found"):
                request_cad_plan("Add a box", BaseplateParams(), [], [])

    def test_explains_when_ollama_is_not_running(self):
        with patch("cad_plan.urlopen", side_effect=ConnectionRefusedError):
            with self.assertRaisesRegex(LocalModelError, "Could not reach Ollama"):
                request_cad_plan("Add a box", BaseplateParams(), [], [])


class HostedModelClientTests(unittest.TestCase):
    def _openai_style_body(self) -> bytes:
        return json.dumps(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "reply": "Added the requested box.",
                                    "operations": [
                                        {
                                            "action": "add_primitive",
                                            "shape": "box",
                                            "length": 30,
                                            "width": 20,
                                            "height": 10,
                                        }
                                    ],
                                }
                            )
                        }
                    }
                ]
            }
        ).encode()

    def test_uses_hosted_endpoint_and_bearer_key_when_configured(self):
        mock_response = BytesIO(self._openai_style_body())
        mock_response.__enter__ = lambda response: response
        mock_response.__exit__ = lambda response, *args: None
        env = {
            "LLM_BASE_URL": "https://api.together.xyz/v1",
            "LLM_MODEL": "meta-llama/Llama-3.1-8B-Instruct-Turbo",
            "LLM_API_KEY": "sk-test-key",
        }
        with patch.dict("os.environ", env, clear=True):
            with patch("cad_plan.urlopen", return_value=mock_response) as urlopen:
                plan = request_cad_plan("Add a box", BaseplateParams(), [], [])

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.together.xyz/v1/chat/completions")
        self.assertEqual(request.headers["Authorization"], "Bearer sk-test-key")
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "meta-llama/Llama-3.1-8B-Instruct-Turbo")
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertEqual(plan.operations[0].shape, "box")

    def test_errors_when_base_url_set_but_no_key(self):
        with patch.dict("os.environ", {"LLM_BASE_URL": "https://api.together.xyz/v1"}, clear=True):
            with self.assertRaisesRegex(LocalModelError, "no API key was found"):
                request_cad_plan("Add a box", BaseplateParams(), [], [])

    def test_resolves_key_from_secrets_manager(self):
        mock_response = BytesIO(self._openai_style_body())
        mock_response.__enter__ = lambda response: response
        mock_response.__exit__ = lambda response, *args: None
        env = {
            "LLM_BASE_URL": "https://api.together.xyz/v1",
            "LLM_API_KEY_SECRET_ARN": "arn:aws:secretsmanager:us-east-2:111122223333:secret:text2shape/llm-api-key",
            "AWS_REGION": "us-east-2",
        }
        fake_secrets_client = unittest.mock.Mock()
        fake_secrets_client.get_secret_value.return_value = {
            "SecretString": json.dumps({"LLM_API_KEY": "sk-from-secrets"})
        }
        fake_boto3 = unittest.mock.Mock()
        fake_boto3.client.return_value = fake_secrets_client
        with patch.dict("os.environ", env, clear=True):
            with patch.dict("sys.modules", {"boto3": fake_boto3}):
                with patch("cad_plan.urlopen", return_value=mock_response) as urlopen:
                    request_cad_plan("Add a box", BaseplateParams(), [], [])

        fake_boto3.client.assert_called_once_with("secretsmanager", region_name="us-east-2")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.headers["Authorization"], "Bearer sk-from-secrets")


if __name__ == "__main__":
    unittest.main()

