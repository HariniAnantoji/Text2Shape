import tempfile
import unittest
from pathlib import Path

from build123d import import_step
from cad_generator import (
    BaseplateParams,
    BoxFeature,
    CylinderFeature,
    HoleFeature,
    SphereFeature,
    generate_baseplate,
    generate_model,
)
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

    def test_generates_model_with_box_cylinder_and_sphere_features(self):
        features = [
            BoxFeature(id="box-1", shape="box", length=20, width=20, height=20, z=10),
            CylinderFeature(id="cylinder-1", shape="cylinder", diameter=12, height=20, x=20, z=10),
            SphereFeature(id="sphere-1", shape="sphere", diameter=10, x=50, z=20),
        ]
        with tempfile.TemporaryDirectory() as temporary_directory:
            artifacts = generate_model(BaseplateParams(), features, Path(temporary_directory))

            self.assertTrue(artifacts.step_path.is_file())
            self.assertGreater(artifacts.step_path.stat().st_size, 0)
            self.assertTrue(artifacts.stl_path.is_file())
            self.assertGreater(artifacts.stl_path.stat().st_size, 0)

    def test_generates_translated_baseplate(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            artifacts = generate_baseplate(
                BaseplateParams(x=12, y=-5, z=20),
                Path(temporary_directory),
            )

            self.assertTrue(artifacts.step_path.is_file())
            self.assertGreater(artifacts.step_path.stat().st_size, 0)
            self.assertTrue(artifacts.stl_path.is_file())
            self.assertGreater(artifacts.stl_path.stat().st_size, 0)
            bounds = import_step(str(artifacts.step_path)).bounding_box()
            self.assertEqual(
                (
                    bounds.min.X,
                    bounds.max.X,
                    bounds.min.Y,
                    bounds.max.Y,
                    bounds.min.Z,
                    bounds.max.Z,
                ),
                (-38, 62, -35, 25, 16, 24),
            )

    def test_generates_model_with_extra_through_hole(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            artifacts = generate_model(
                BaseplateParams(),
                [],
                Path(temporary_directory),
                [HoleFeature(id="center-hole", x=0, y=0, diameter=8)],
            )

            self.assertTrue(artifacts.step_path.is_file())
            self.assertGreater(artifacts.step_path.stat().st_size, 0)
            self.assertTrue(artifacts.stl_path.is_file())
            self.assertGreater(artifacts.stl_path.stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
