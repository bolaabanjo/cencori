-- Persist the terminal event, session state, and cumulative session cost in
-- one transaction. Without this, a process interruption could expose a
-- completed SSE event while leaving the session paused/active incorrectly or
-- omit the session-level cost.

CREATE OR REPLACE FUNCTION public.finalize_session_turn(
    p_session_id uuid,
    p_project_id uuid,
    p_turn_number integer,
    p_sequence integer,
    p_event_type text,
    p_payload jsonb,
    p_status text,
    p_cost numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_project_id uuid;
BEGIN
    IF p_event_type NOT IN ('turn.paused', 'turn.completed', 'turn.failed') THEN
        RAISE EXCEPTION 'Invalid terminal session event type';
    END IF;
    IF p_status NOT IN ('active', 'paused', 'completed', 'failed') THEN
        RAISE EXCEPTION 'Invalid session status';
    END IF;
    IF p_cost < 0 THEN
        RAISE EXCEPTION 'Session cost cannot be negative';
    END IF;

    SELECT s.project_id
    INTO v_project_id
    FROM public.sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND OR v_project_id <> p_project_id THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    INSERT INTO public.session_events (
        session_id,
        turn_number,
        sequence,
        event_type,
        payload
    ) VALUES (
        p_session_id,
        p_turn_number,
        p_sequence,
        p_event_type,
        COALESCE(p_payload, '{}'::jsonb)
    );

    UPDATE public.sessions
    SET status = p_status,
        last_turn_number = p_turn_number,
        expires_at = CASE
            WHEN p_status = 'paused' THEN now() + interval '24 hours'
            ELSE NULL
        END,
        total_cost_usd = COALESCE(total_cost_usd, 0) + p_cost
    WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_session_turn(uuid, uuid, integer, integer, text, jsonb, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_session_turn(uuid, uuid, integer, integer, text, jsonb, text, numeric) TO service_role;
