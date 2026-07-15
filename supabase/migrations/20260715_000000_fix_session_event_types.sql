-- Keep the persisted session event contract aligned with SessionEventType.
-- The original constraint omitted failure and checkpoint events, causing
-- those inserts to fail even though the runtime emits them.

ALTER TABLE public.session_events
    DROP CONSTRAINT IF EXISTS session_events_event_type_check;

ALTER TABLE public.session_events
    ADD CONSTRAINT session_events_event_type_check
    CHECK (event_type IN (
        'turn.started',
        'output_text.delta',
        'tool_call.started',
        'tool_call.completed',
        'turn.paused',
        'turn.resumed',
        'turn.completed',
        'turn.failed',
        'turn.checkpoint'
    ));
