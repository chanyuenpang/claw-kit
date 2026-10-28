# Unity UI Trace Contract

Trigger this contract for UIToolkit visual semantics (layout, element, style, selector behavior).

## Input

- `target`: C# class name or UXML path
- `goal`: `asset_refs | template_refs | selector_bindings`
- `selector_mode` (optional): `balanced` (default) or `strict`

## Goals

- `asset_refs`: which prefab/asset references the target UXML
- `template_refs`: which UXML templates are referenced by the target UXML
- `selector_bindings`: C# `AddToClassList/Q(className)` → USS selector evidence chain

## Selector Modes (selector_bindings only)

- `balanced` (default): match class tokens inside composite selectors — higher recall
- `strict`: only exact `.className` selectors — higher precision

## Output Fields

- `results[].evidence_chain`: each hop has `path + line + snippet`
- `results[].score`: ranking score (higher = higher priority)
- `results[].confidence`: `high|medium|low`
- `diagnostics`: `not_found|ambiguous`

## Default Order

1. `asset_refs` — confirm asset reference chain exists
2. `template_refs` — confirm template reference chain exists
3. `selector_bindings` — use `balanced` first; switch to `strict` if false positives suspected
