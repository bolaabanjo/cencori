-- Resolve a paused session exactly once. The audit event(s) and session state
-- change must commit together so concurrent approvals/rejections cannot leave
-- an orphaned turn.resumed event or a consumed pause with stale status.

CREATE OR REPLACE FUNCTION public.resolve_session_pause(
    p_session_id uuid,
    p_project_id uuid,
    p_turn_number integer,
    p_action_id text,
    p_resolution text
)
RETURNS TABLE (
    applied boolean,
    error_code text,
    next_sequence integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_project_id uuid;
    v_pause_payload jsonb;
    v_next_sequence integer;
BEGIN
    IF p_resolution NOT IN ('approved', 'rejected') THEN
        RETURN QUERY SELECT false, 'invalid_resolution'::text, 0;
        RETURN;
    END IF;

    SELECT s.status, s.project_id
    INTO v_status, v_project_id
    FROM public.sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND OR v_project_id <> p_project_id THEN
        RETURN QUERY SELECT false, 'session_not_found'::text, 0;
        RETURN;
    END IF;
    IF v_status <> 'paused' THEN
        RETURN QUERY SELECT false, 'session_not_paused'::text, 0;
        RETURN;
    END IF;

    SELECT e.payload
    INTO v_pause_payload
    FROM public.session_events e
    WHERE e.session_id = p_session_id
      AND e.turn_number = p_turn_number
      AND e.event_type = 'turn.paused'
    ORDER BY e.sequence DESC
    LIMIT 1;

    IF v_pause_payload IS NULL THEN
        RETURN QUERY SELECT false, 'no_pending_pause'::text, 0;
        RETURN;
    END IF;
    IF v_pause_payload->>'action_id' IS DISTINCT FROM p_action_id THEN
        RETURN QUERY SELECT false, 'action_id_mismatch'::text, 0;
        RETURN;
    END IF;

    SELECT COALESCE(MAX(e.sequence), 0) + 1
    INTO v_next_sequence
    FROM public.session_events e
    WHERE e.session_id = p_session_id
      AND e.turn_number = p_turn_number;

    INSERT INTO public.session_events (
        session_id,
        turn_number,
        sequence,
        event_type,
        payload
    ) VALUES (
        p_session_id,
        p_turn_number,
        v_next_sequence,
        'turn.resumed',
        jsonb_build_object('action_id', p_action_id, 'resolution', p_resolution)
    );

    IF p_resolution = 'rejected' THEN
        INSERT INTO public.session_events (
            session_id,
            turn_number,
            sequence,
            event_type,
            payload
        ) VALUES (
            p_session_id,
            p_turn_number,
            v_next_sequence + 1,
            'turn.completed',
            jsonb_build_object(
                'turn_number', p_turn_number,
                'output', jsonb_build_object(
                    'tool_call_rejected', true,
                    'action_id', p_action_id
                ),
                'usage', jsonb_build_object(
                    'input_tokens', 0,
                    'output_tokens', 0,
                    'total_tokens', 0
                )
            )
        );
    END IF;

    UPDATE public.sessions
    SET status = 'active', expires_at = NULL
    WHERE id = p_session_id;

    RETURN QUERY SELECT true, NULL::text, v_next_sequence;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_session_pause(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_session_pause(uuid, uuid, integer, text, text) TO service_role;
