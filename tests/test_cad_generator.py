import tempfile
import unittest
from pathlib import Path

from build123d import Align, Box, Pos, export_stl, import_step, import_stl
from cad_generator import (
    BaseplateParams,
    BoxFeature,
    CylinderFeature,
    HoleFeature,
    ImportedMesh,
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
                BaseplateParams(x=-200, y=-200, z=-200),
                [],
                Path(temporary_directory),
                [HoleFeature(id="center-hole", x=0, y=0, diameter=8)],
            )

            self.assertTrue(artifacts.step_path.is_file())
            self.assertGreater(artifacts.step_path.stat().st_size, 0)
            self.assertTrue(artifacts.stl_path.is_file())
            self.assertGreater(artifacts.stl_path.stat().st_size, 0)

    def test_centers_scales_and_places_imported_mesh(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_path = root / "source.stl"
            export_stl(
                Pos(100, 200, 300) * Box(10, 20, 30, align=(Align.CENTER, Align.CENTER, Align.CENTER)),
                str(source_path),
            )
            imported_mesh = ImportedMesh(
                id="a" * 32,
                filename="source.stl",
                length=10,
                width=20,
                height=30,
                x=1000,
                y=1200,
                z=1400,
                scale_factor=2,
            )

            artifacts = generate_model(
                BaseplateParams(),
                [],
                root / "output",
                imported_mesh=imported_mesh,
                imported_mesh_path=source_path,
            )

            # The imported mesh is a triangulated Face, not a B-rep solid, so it
            # is merged into the STL output (what the viewer renders) while the
            # STEP export keeps only the parametric solid model. The STL bounds
            # must reach out to the placed/scaled mesh near (1000, 1200, 1400).
            # A wider delta allows for STL faceting of the source box.
            stl_bounds = import_stl(str(artifacts.stl_path)).bounding_box()
            self.assertAlmostEqual(stl_bounds.max.X, 1005, delta=1.0)
            self.assertAlmostEqual(stl_bounds.max.Y, 1210, delta=1.0)
            self.assertAlmostEqual(stl_bounds.max.Z, 1415, delta=1.0)
            # The baseplate still anchors the lower bounds.
            self.assertAlmostEqual(stl_bounds.min.X, -50, delta=0.1)
            self.assertAlmostEqual(stl_bounds.min.Z, -4, delta=0.1)

            # The STEP export is solid-only: just the 100 x 60 x 8 baseplate,
            # centered at the origin. The imported mesh must NOT appear in STEP.
            step_bounds = import_step(str(artifacts.step_path)).bounding_box()
            self.assertAlmostEqual(step_bounds.min.X, -50, delta=0.1)
            self.assertAlmostEqual(step_bounds.max.X, 50, delta=0.1)
            self.assertAlmostEqual(step_bounds.min.Y, -30, delta=0.1)
            self.assertAlmostEqual(step_bounds.max.Y, 30, delta=0.1)
            self.assertAlmostEqual(step_bounds.min.Z, -4, delta=0.1)
            self.assertAlmostEqual(step_bounds.max.Z, 4, delta=0.1)


if __name__ == "__main__":
    unittest.main()
