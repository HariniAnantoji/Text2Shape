import shutil
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from urllib.parse import urlsplit

from build123d import Box, export_stl
from fastapi.testclient import TestClient

from ai_cad import CADOperation, CADPlan, LocalModelError
from main import ARTIFACTS_DIR, IMPORTS_DIR, app


class GenerateEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.plan_patcher = patch("main.request_cad_plan", side_effect=self.default_plan)
        self.request_plan = self.plan_patcher.start()

    def tearDown(self):
        self.client.close()
        self.plan_patcher.stop()

    @staticmethod
    def default_plan(prompt, cad_params, features, holes, imported_mesh=None):
        return CADPlan(
            reply="Generated from the current design.",
            operations=[
                CADOperation(
                    action="set_baseplate",
                    baseplate_length=cad_params.length,
                    baseplate_width=cad_params.width,
                    baseplate_thickness=cad_params.thickness,
                    hole_diameter=cad_params.hole_diameter,
                    edge_offset=cad_params.edge_offset,
                    x=cad_params.x,
                    y=cad_params.y,
                    z=cad_params.z,
                )
            ],
        )

    def register_generated_file_cleanup(self, response_body):
        model_id = Path(urlsplit(response_body["files"]["step_url"]).path).parent.name
        self.addCleanup(shutil.rmtree, ARTIFACTS_DIR / model_id, ignore_errors=True)

    def test_generates_and_serves_baseplate_exports(self):
        response = self.client.post(
            "/generate",
            json={
                "prompt": "Create a 120 x 80 mm baseplate with 8 mm holes",
                "cad_params": {
                    "length": 120,
                    "width": 80,
                    "thickness": 10,
                    "hole_diameter": 8,
                    "edge_offset": 12,
                    "x": 12,
                    "y": -5,
                    "z": 20,
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "generated")
        self.assertIsNotNone(body["files"])
        self.register_generated_file_cleanup(body)
        self.assertEqual(
            body["cad_params"],
            {
                "length": 120,
                "width": 80,
                "thickness": 10,
                "hole_diameter": 8,
                "edge_offset": 12,
                "x": 12,
                "y": -5,
                "z": 20,
            },
        )

        for file_url in body["files"].values():
            file_response = self.client.get(
                urlsplit(file_url).path,
                headers={"Origin": "http://localhost:3000"},
            )
            self.assertEqual(file_response.status_code, 200)
            self.assertGreater(len(file_response.content), 0)
            self.assertEqual(
                file_response.headers["access-control-allow-origin"],
                "http://localhost:3000",
            )

    def test_uses_default_parameters_when_not_supplied(self):
        response = self.client.post(
            "/generate",
            json={"prompt": "Create a 100 x 60 mm baseplate with 6 mm holes"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.register_generated_file_cleanup(body)
        self.assertEqual(
            body["cad_params"],
            {
                "length": 100,
                "width": 60,
                "thickness": 8,
                "hole_diameter": 6,
                "edge_offset": 10,
                "x": 0,
                "y": 0,
                "z": 0,
            },
        )

    def test_generates_model_with_primitive_features(self):
        feature = {
            "id": "demo-box",
            "shape": "box",
            "length": 20,
            "width": 20,
            "height": 20,
            "z": 10,
        }
        response = self.client.post(
            "/generate",
            json={
                "prompt": "Create a 100 x 60 mm baseplate with 6 mm holes",
                "features": [feature],
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "generated")
        self.assertEqual(
            body["features"],
            [{
                **feature,
                "x": 0,
                "y": 0,
                "length": 20,
                "width": 20,
                "height": 20,
            }],
        )
        self.register_generated_file_cleanup(body)
        for file_url in body["files"].values():
            file_response = self.client.get(urlsplit(file_url).path)
            self.assertEqual(file_response.status_code, 200)
            self.assertGreater(len(file_response.content), 0)

    def test_uploads_stl_and_continues_generation_with_imported_mesh(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            stl_path = Path(temporary_directory) / "part.stl"
            export_stl(Box(10, 20, 30), str(stl_path))
            upload = self.client.post(
                "/imports",
                content=stl_path.read_bytes(),
                headers={
                    "Content-Type": "application/octet-stream",
                    "X-Filename": "part.stl",
                },
            )

        self.assertEqual(upload.status_code, 201)
        imported = upload.json()
        imported_id = imported["id"]
        self.addCleanup((IMPORTS_DIR / f"{imported_id}.stl").unlink, missing_ok=True)
        source_response = self.client.get(urlsplit(imported["source_url"]).path)
        self.assertEqual(source_response.status_code, 200)
        self.assertGreater(len(source_response.content), 0)

        response = self.client.post(
            "/generate",
            json={
                "prompt": "Add a box beside the imported mesh",
                "imported_mesh": {key: value for key, value in imported.items() if key != "source_url"},
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "generated")
        self.assertEqual(body["imported_mesh"]["id"], imported_id)
        self.register_generated_file_cleanup(body)
        for file_url in body["files"].values():
            file_response = self.client.get(urlsplit(file_url).path)
            self.assertEqual(file_response.status_code, 200)
            self.assertGreater(len(file_response.content), 0)

    def test_rejects_non_stl_upload(self):
        response = self.client.post(
            "/imports",
            content=b"not an STL",
            headers={"X-Filename": "part.obj"},
        )
        self.assertEqual(response.status_code, 415)

    def test_rejects_invalid_stl_mesh(self):
        response = self.client.post(
            "/imports",
            content=b"not geometry",
            headers={"X-Filename": "part.stl"},
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_oversized_stl_before_reading_body(self):
        response = self.client.post(
            "/imports",
            content=b"",
            headers={
                "X-Filename": "part.stl",
                "Content-Length": str(25 * 1024 * 1024 + 1),
            },
        )
        self.assertEqual(response.status_code, 413)

    def test_chat_adds_primitive_and_returns_updated_state(self):
        self.request_plan.side_effect = None
        self.request_plan.return_value = CADPlan(
            reply="Added a box on top of the plate.",
            operations=[
                CADOperation(
                    action="add_primitive",
                    shape="box",
                    length=30,
                    width=20,
                    height=10,
                )
            ],
        )
        response = self.client.post(
            "/generate",
            json={
                "prompt": "Add a 30 x 20 x 10 mm box on top",
                "cad_params": {"length": 100, "width": 60, "thickness": 8},
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "generated")
        self.assertEqual(len(body["features"]), 1)
        self.assertEqual(body["features"][0]["shape"], "box")
        self.assertEqual(body["features"][0]["length"], 30)
        self.assertEqual(body["features"][0]["z"], 9)
        self.assertEqual(body["holes"], [])
        self.register_generated_file_cleanup(body)

    def test_chat_adds_extra_hole_and_exports_the_design(self):
        self.request_plan.side_effect = None
        self.request_plan.return_value = CADPlan(
            reply="Added a 5 mm through-hole at the center.",
            operations=[
                CADOperation(
                    action="add_hole",
                    x=0,
                    y=0,
                    diameter=5,
                )
            ],
        )
        response = self.client.post(
            "/generate",
            json={"prompt": "Add a 5 mm through-hole at the center"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "generated")
        self.assertEqual(
            body["holes"],
            [{"id": body["holes"][0]["id"], "x": 0, "y": 0, "diameter": 5}],
        )
        self.register_generated_file_cleanup(body)

    def test_rejects_extra_hole_outside_baseplate_bounds(self):
        response = self.client.post(
            "/generate",
            json={
                "prompt": "Make the plate longer",
                "holes": [{"id": "outside", "x": 60, "y": 0, "diameter": 6}],
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_returns_clear_error_when_local_model_is_unavailable(self):
        self.request_plan.side_effect = LocalModelError(
            "Could not reach Ollama at http://localhost:11434. Start Ollama and ensure the model is downloaded."
        )
        response = self.client.post("/generate", json={"prompt": "Add a box"})

        self.assertEqual(response.status_code, 503)
        self.assertIn("Could not reach Ollama", response.json()["detail"])

    @patch("main.get_artifact_object")
    @patch("main.upload_artifact")
    def test_uploads_and_serves_artifacts_from_s3(self, upload_artifact, get_artifact_object):
        class ArtifactBody:
            def iter_chunks(self, chunk_size):
                yield b"mock S3 artifact"

            def close(self):
                pass

        get_artifact_object.return_value = {"Body": ArtifactBody()}
        with patch.dict(
            "os.environ",
            {"S3_BUCKET_NAME": "text2shape-cad-artifacts-2026", "AWS_REGION": "us-east-2"},
        ):
            response = self.client.post(
                "/generate",
                json={"prompt": "Create a 100 x 60 mm baseplate with 6 mm holes"},
            )

            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual(body["status"], "generated")
            upload_calls = upload_artifact.call_args_list
            self.assertEqual(len(upload_calls), 2)
            self.assertTrue(upload_calls[0].args[1].endswith("/baseplate.stl"))
            self.assertTrue(upload_calls[1].args[1].endswith("/baseplate.step"))

            for file_url in body["files"].values():
                file_response = self.client.get(urlsplit(file_url).path)
                self.assertEqual(file_response.status_code, 200)
                self.assertEqual(file_response.content, b"mock S3 artifact")

        self.assertEqual(get_artifact_object.call_count, 2)

    def test_returns_clarification_without_files_for_generic_prompt(self):
        self.request_plan.side_effect = None
        self.request_plan.return_value = CADPlan(
            reply="What size should the baseplate be?",
            operations=[CADOperation(action="clarify")],
        )
        response = self.client.post("/generate", json={"prompt": "A baseplate"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "clarification")
        self.assertIsNone(body["files"])

    def test_returns_unsupported_without_files_for_unsupported_object(self):
        self.request_plan.side_effect = None
        self.request_plan.return_value = CADPlan(
            reply="That is outside this MVP.",
            operations=[CADOperation(action="unsupported")],
        )
        response = self.client.post("/generate", json={"prompt": "Make a sphere"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "unsupported")
        self.assertIsNone(body["files"])

    def test_rejects_invalid_hole_dimensions(self):
        response = self.client.post(
            "/generate",
            json={
                "prompt": "A baseplate",
                "cad_params": {
                    "length": 30,
                    "width": 30,
                    "thickness": 8,
                    "hole_diameter": 6,
                    "edge_offset": 15,
                },
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_rejects_blank_prompt(self):
        response = self.client.post("/generate", json={"prompt": "   "})

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
