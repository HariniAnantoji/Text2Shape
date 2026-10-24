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

    def test_relative_thickness_edit_accepts_an_explicit_amount(self):
        result = interpret_prompt("Make it 3 mm thicker", self.current)

        self.assertEqual(result.status, "generated")
        self.assertEqual(result.cad_params.thickness, self.current.thickness + 3)

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
