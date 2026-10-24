import unittest

from cad_generator import BaseplateParams
from prompt_parser import interpret_prompt


class PromptParserTests(unittest.TestCase):
    def setUp(self):
        self.current = BaseplateParams()

    def test_extracts_dimensions_and_hole_diameter(self):
        result = interpret_prompt(
            "Make it 120 × 80 mm with 8 mm holes",
            self.current,
        )

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.length, 120)
        self.assertEqual(result.cad_params.width, 80)
        self.assertEqual(result.cad_params.hole_diameter, 8)
        self.assertEqual(result.cad_params.thickness, self.current.thickness)

    def test_explicit_current_dimensions_still_generate_a_model(self):
        result = interpret_prompt(
            "Create a 100 × 60 mm baseplate with 6 mm holes",
            self.current,
        )

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params, self.current)

    def test_relative_thickness_edit_uses_current_parameters(self):
        first_edit = interpret_prompt(
            "Make it 120 × 80 mm with 8 mm holes",
            self.current,
        )
        result = interpret_prompt("Make it thicker", first_edit.cad_params)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.thickness, self.current.thickness + 2)
        self.assertEqual(result.cad_params.length, 120)
        self.assertEqual(result.cad_params.width, 80)
        self.assertEqual(result.cad_params.hole_diameter, 8)

    def test_longer_prompt_changes_baseplate_length(self):
        result = interpret_prompt("Make the baseplate longer", self.current)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.length, self.current.length + 10)

    def test_relative_thickness_edit_accepts_an_explicit_amount(self):
        result = interpret_prompt("Make it 3 mm thicker", self.current)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.thickness, self.current.thickness + 3)

    def test_generic_size_prompts_ask_which_dimension(self):
        for prompt in ("Make the baseplate larger", "Make the baseplate smaller"):
            with self.subTest(prompt=prompt):
                result = interpret_prompt(prompt, self.current)

                self.assertEqual(result.status, "clarification")
                self.assertEqual(result.cad_params, self.current)

    def test_hole_specific_larger_prompt_changes_hole_diameter(self):
        result = interpret_prompt("Make the holes larger", self.current)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.hole_diameter, self.current.hole_diameter + 1)

    def test_reduce_hole_spacing_from_edges_changes_edge_offset(self):
        result = interpret_prompt("Reduce the hole spacing from the edges", self.current)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.edge_offset, self.current.edge_offset - 2)

    def test_four_corner_hole_creation_generates_current_parameters(self):
        result = interpret_prompt("Create a baseplate with four corner holes", self.current)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params, self.current)

    def test_m6_mounting_holes_generate_current_parameters(self):
        result = interpret_prompt("Add 4 mounting holes M6", self.current)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.hole_diameter, 6)

    def test_ambiguous_prompt_asks_for_clarification(self):
        result = interpret_prompt("Make it 120 mm", self.current)

        self.assertEqual(result.status, "clarification")
        self.assertEqual(result.cad_params, self.current)

    def test_unsupported_object_does_not_change_parameters(self):
        result = interpret_prompt("Make a sphere", self.current)

        self.assertEqual(result.status, "unsupported")
        self.assertEqual(result.cad_params, self.current)

    def test_invalid_hole_clearance_asks_for_clarification(self):
        result = interpret_prompt("Make it 20 × 10 mm with 12 mm holes", self.current)

        self.assertEqual(result.status, "clarification")
        self.assertEqual(result.cad_params, self.current)


if __name__ == "__main__":
    unittest.main()
