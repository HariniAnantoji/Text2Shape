import tempfile
import unittest
from pathlib import Path

from cad_generator import BaseplateParams, generate_baseplate
from pydantic import ValidationError


class BaseplateGeneratorTests(unittest.TestCase):
    def test_generates_step_and_stl_files(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            artifacts = generate_baseplate(
                BaseplateParams(),
                Path(temporary_directory),
            )

            self.assertTrue(artifacts.step_path.is_file())
            self.assertGreater(artifacts.step_path.stat().st_size, 0)
            self.assertTrue(artifacts.stl_path.is_file())
            self.assertGreater(artifacts.stl_path.stat().st_size, 0)

    def test_rejects_holes_that_break_through_plate_edge(self):
        with self.assertRaises(ValidationError):
            BaseplateParams(length=100, width=60, hole_diameter=12, edge_offset=5)

    def test_rejects_hole_pattern_that_does_not_fit(self):
        with self.assertRaises(ValidationError):
            BaseplateParams(length=30, width=30, edge_offset=15)


if __name__ == "__main__":
    unittest.main()
