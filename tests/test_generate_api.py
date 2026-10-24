import shutil
import unittest
from pathlib import Path
from urllib.parse import urlsplit

from fastapi.testclient import TestClient

from main import GENERATED_MODELS_DIR, app


class GenerateEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def register_generated_file_cleanup(self, response_body):
        model_id = Path(urlsplit(response_body["files"]["step_url"]).path).parent.name
        self.addCleanup(shutil.rmtree, GENERATED_MODELS_DIR / model_id, ignore_errors=True)

    def test_generates_and_serves_baseplate_exports(self):
        response = self.client.post(
            "/generate",
            json={
                "prompt": "A baseplate",
                "cad_params": {
                    "length": 120,
                    "width": 80,
                    "thickness": 10,
                    "hole_diameter": 8,
                    "edge_offset": 12,
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.register_generated_file_cleanup(body)
        self.assertEqual(
            body["cad_params"],
            {
                "length": 120,
                "width": 80,
                "thickness": 10,
                "hole_diameter": 8,
                "edge_offset": 12,
            },
        )
        self.assertIn("four mounting holes", body["message"])

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
        response = self.client.post("/generate", json={"prompt": "A baseplate"})

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
            },
        )

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
