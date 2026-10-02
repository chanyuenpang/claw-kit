# Codex Hooks Strategy

Codex registers only a thread-scoped `SessionStart` hook. It recovers the current workflow and registers the report collector from the actual adapter directory. The fixed code-mode driver also registers the collector before mutations and after first project initialization, so finalization does not depend on hook delivery.

The terminal root-plan mutation creates a durable queued job and returns a native isolated-finalizer dispatch. The main agent accepts that handoff before ending its turn. Claim captures the parent transcript within the frozen plan interval, including successful task.done checkpoints' preceding assistant conclusions and prior final answers, before granting a claim token.

Codex has no Stop hook, SDK writer, or configurable execution flow. Failed capture leaves the job queued without granting execution ownership. Canonical plan completion and asynchronous knowledge completion remain separate.
