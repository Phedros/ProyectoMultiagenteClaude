"""
System prompt variable interpolation.

Supported placeholders:
  {{flow_input}}       — the original user input for this flow run
  {{previous_output}}  — the output from the immediately preceding agent
  {{date}}             — today's date  (YYYY-MM-DD)
  {{agent_name}}       — the name of the current agent
  {{iteration}}        — current loop iteration number (1-based, "1" when not in a loop)
"""
from __future__ import annotations
from datetime import date


def render_prompt(
    template: str,
    *,
    flow_input: str = "",
    previous_output: str = "",
    agent_name: str = "",
    iteration: int = 1,
) -> str:
    """
    Replace all known {{variable}} placeholders in *template*.

    Unknown placeholders are left untouched so the LLM can see them verbatim.
    """
    replacements = {
        "{{flow_input}}":       flow_input,
        "{{previous_output}}":  previous_output,
        "{{date}}":             date.today().isoformat(),
        "{{agent_name}}":       agent_name,
        "{{iteration}}":        str(iteration),
    }
    result = template
    for placeholder, value in replacements.items():
        result = result.replace(placeholder, value)
    return result
