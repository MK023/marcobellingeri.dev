---
lang: en
title: "From text-JSON parsing to Claude tool use in JobSearch"
date: 2026-07-21
description: "I had five functions whose only job was repairing JSON that Claude had just written. One PR deleted them all, and the surprise came after launch."
tags: [ai, python, claude, programming]
---

My job-search tool had five functions whose only purpose was fixing JSON that Claude had just written. `_clean_json_text`, `_fix_unescaped_newlines`, `_fix_single_quotes`, `_strip_markdown_wrapper`, `_extract_and_parse_json`. There was also a sixth, `_retry_json_fix`, which took the broken JSON and sent it back to the model with a polite request to fix its own mess. I wrote every one of them, one bug at a time, over weeks. I was a little proud of them.

That was the problem.

## How you end up with five parsers

JobSearch is my personal tool, in production, single user: me. It ingests job offers from nine boards, and when I press "Analyze", Claude reads the offer against my CV and returns a structured verdict: score, recommendation, career track, the English level the ad actually requires. That verdict has to be JSON, because everything downstream is a database row, not prose.

The first version did what every tutorial does. Ask the model for JSON in the prompt, take `response.content[0].text`, run `json.loads` on it. It worked in the demo and then production started teaching me things.

The model wrapped the JSON in markdown fences, so I wrote a function to strip them. Sometimes it used single quotes, so I wrote a function to fix those. Then a description with a line break inside a string, so I wrote `_fix_unescaped_newlines`. Then a `NaN` where a number should be. Every fix was five lines, obviously correct, and came with its own tests. I still have the test names in the git history and they read like a confession: `test_removes_trailing_commas`, `test_replaces_nan_with_null`, `test_replaces_infinity`, `test_unclosed_fence_still_strips_opening`.

By April the parsing layer was around 250 lines with seven strategies, chained, each catching what the previous one let through. The last resort was the AI self-repair call: if nothing parsed, send the broken output back and ask the model to repair it. A second API call, with real latency and real cost, to fix a formatting problem the first call should never have had.

I had a test suite asserting that my code could survive output nobody should ever have produced. That is not robustness. That is a bug report addressed to the wrong recipient.

## The actual fix

Anthropic's API has tool use. You normally reach for it to let the model call your functions. But it has a stricter reading: if you define exactly one tool whose input schema is the shape of the answer you want, and you force it with `tool_choice`, the model cannot answer any other way. The JSON arrives already parsed, validated against the schema by the API itself, as a Python dict on the response object.

I already had a Pydantic model for the analysis, because the DB row needed one. So the schema was free:

```python
def _schema_from_model(model_cls: type[BaseModel]) -> dict[str, Any]:
    """Produce a JSON Schema from a Pydantic model, suitable for input_schema."""
    ...

response = client.messages.create(
    model=model_id,
    system=system,
    messages=[{"role": "user", "content": user}],
    tools=[{
        "name": "submit_analysis",
        "description": "Return the structured job analysis.",
        "input_schema": _schema_from_model(JobAnalysis),
    }],
    tool_choice={"type": "tool", "name": "submit_analysis"},
)
block = next(b for b in response.content if b.type == "tool_use")
data = block.input  # a dict, parsed by the SDK, no text in sight
```

The refactor landed on April 14 as one commit: every AI call in the codebase migrated, all five parsers deleted, the self-repair fallback deleted, the garbage-JSON test file deleted with them. The commit message says minus 200 lines and it undersells it, because the lines that left were the ones I had to re-read every time something broke.

It was the scary PR of the batch. I shipped it in the middle of an afternoon where Claude and I pushed thirteen PRs to production, and I wrote about that day [separately](https://dev.to/mk023/how-i-shipped-13-prs-in-one-afternoon-pair-programming-with-claude-and-what-i-learned-1274). Twelve of those PRs were routine. This one deleted a safety net and replaced it with a promise from an API, in the same diff.

One thing I kept: the Pydantic validation after the call. The schema guarantees shape, not sense. A score of 950 on a 0-100 field is schema-valid JSON and still garbage, and model output stays untrusted input no matter how it is delivered. The contract moved into the API; the checking stayed on my side of it.

## The surprise came after launch

Here is the part I did not expect, and the reason this piece is not just "use tool use, delete your parsers".

With text output, the model treated my prompt rules a bit loosely, and the parsing chaos hid it. With a forced schema, it obeys much more literally. I had a fallback rule for freelance positions: Italian job ads sometimes want a P.IVA, a VAT number, which changes whether the offer makes sense for me at all. The rule said, roughly, "if freelance status is ambiguous, flag it". Under tool use the model started flagging offers that mentioned freelancing in passing, a line about contractors in another team, anything. Ambiguous had quietly meant "mentioned anywhere".

The schema made the model more obedient, and the obedience exposed how sloppy my instructions had been. The fix was not code. It was rewriting the prompt with explicit precedence: the contract type stated in the offer wins, the fallback fires only when the offer itself is about the contract and does not settle it.

So the lesson I actually paid for: when you migrate from text parsing to tool use, your interpretive prompt rules need to be tightened, not loosened. The model stops improvising on format and starts taking your words seriously. If your rules were vague, you find out now.

## What I would tell past me

The parsers were never defensive programming. They were a symptom that the contract lived on the wrong side of the API call, and every new repair function was me renegotiating that contract in the worst possible place, after the response, one edge case at a time.

If your pipeline has a function called `_fix_single_quotes`, you do not need a better parser. Move the shape into `input_schema`, force the tool, keep your validation, and delete the museum. Then go re-read your prompt, because the model is about to start believing every word of it.
