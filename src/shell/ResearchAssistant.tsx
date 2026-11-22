import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, GripHorizontal, MoveDiagonal2, Plus, Square, X } from "lucide-react";
import assistantMascot from "./assistant-mascot.png";
import { chooseDock, constrainAssistant, resizePanel, viewportSize, type Dock, type Point, type Size } from "./assistant-position";
import { askAssistant, maxQuestionLength, type ChatHistory } from "./chat-stream";
import { useFloatingDrag } from "./useFloatingDrag";
import "./research-assistant.css";

const endpoint = import.meta.env.VITE_CHAT_API_URL?.trim() ||
  (import.meta.env.DEV ? "http://127.0.0.1:8765/api/chat" : "");

type Turn = ChatHistory & {
  id: number;
  status: "streaming" | "done" | "stopped" | "error";
  note?: string;
};

function Mascot() {
  return (
    <span className="research-assistant-mascot">
      <img src={assistantMascot} alt="" decoding="async" draggable={false} />
    </span>
  );
}

function positionStyle(position: Point | null) {
  return position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined;
}

const resizeKeys: Partial<Record<string, Point>> = {
  ArrowLeft: { x: -16, y: 0 },
  ArrowRight: { x: 16, y: 0 },
  ArrowUp: { x: 0, y: -16 },
  ArrowDown: { x: 0, y: 16 },
};

export default function ResearchAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [triggerPosition, setTriggerPosition] = useState<Point | null>(null);
  const [dock, setDock] = useState<Dock>({ above: true, right: true });
  const [customSizes, setCustomSizes] = useState<{ prompt?: Size; answer?: Size }>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const inFlight = useRef<{ id: number; controller: AbortController } | null>(null);
  const nextId = useRef(0);
  const panelId = useId();
  const titleId = useId();
  const expanded = turns.length > 0;
  const streaming = turns.at(-1)?.status === "streaming";
  const sizeMode = expanded ? "answer" : "prompt";
  const dialogSize = customSizes[sizeMode] ?? (expanded && customSizes.prompt ? {
    width: `max(var(--assistant-expanded-width), ${customSizes.prompt.width}px)`,
    height: `max(var(--assistant-expanded-height), ${customSizes.prompt.height}px)`,
  } : undefined);
  const dragWidget = useFloatingDrag(trigger, (start, delta) => {
    setTriggerPosition(constrainAssistant(
      { ...start, x: start.x + delta.x, y: start.y + delta.y },
      panel.current?.getBoundingClientRect(), dock, viewportSize(),
    ));
  });
  const dragResize = useFloatingDrag(panel, changeSize);

  useLayoutEffect(() => {
    const button = trigger.current;
    const dialog = panel.current;
    if (!button) return;

    const updatePositions = () => {
      const buttonBounds = button.getBoundingClientRect();
      const anchor = constrainAssistant(buttonBounds, dialog?.getBoundingClientRect(), dock, viewportSize());
      if (anchor.x !== buttonBounds.x || anchor.y !== buttonBounds.y) {
        setTriggerPosition(anchor);
      }
    };

    updatePositions();
    const observer = new ResizeObserver(updatePositions);
    observer.observe(button);
    if (dialog) observer.observe(dialog);
    window.addEventListener("resize", updatePositions);
    return () => {
      window.removeEventListener("resize", updatePositions);
      observer.disconnect();
    };
  }, [dock, expanded, open]);

  useEffect(() => () => inFlight.current?.controller.abort(), []);
  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);
  useLayoutEffect(() => {
    if (expanded) transcript.current?.focus({ preventScroll: true });
  }, [expanded]);
  useLayoutEffect(() => {
    if (follow.current && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight;
    }
  }, [open, turns]);

  function updateTurn(id: number, update: (turn: Turn) => Turn) {
    setTurns((current) => current.map((turn) => turn.id === id ? update(turn) : turn));
  }

  function stop() {
    const request = inFlight.current;
    if (!request) return;
    inFlight.current = null;
    request.controller.abort();
    updateTurn(request.id, (turn) => ({ ...turn, status: "stopped" }));
  }

  function close() {
    stop();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    const bounds = trigger.current?.getBoundingClientRect();
    if (bounds) setDock(chooseDock(bounds, viewportSize()));
    setOpen(true);
  }

  function changeSize(start: Size, delta: Point) {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const next = resizePanel(start, delta, bounds, dock, viewportSize(), expanded);
    setCustomSizes((current) => ({ ...current, [sizeMode]: next }));
  }

  function reset() {
    stop();
    setTurns([]);
    setQuestion("");
    input.current?.focus({ preventScroll: true });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || !endpoint || inFlight.current) return;

    const history = turns.filter((turn) => turn.status === "done" && turn.answer);
    const id = nextId.current++;
    const controller = new AbortController();
    inFlight.current = { id, controller };
    follow.current = true;
    setQuestion("");
    setTurns((current) => [...current, { id, question: prompt, answer: "", status: "streaming" }]);
    input.current?.blur();

    try {
      const result = await askAssistant(endpoint, prompt, history, controller.signal, (text) => {
        if (inFlight.current?.id === id) {
          updateTurn(id, (turn) => ({ ...turn, answer: turn.answer + text }));
        }
      });
      if (inFlight.current?.id === id) {
        updateTurn(id, (turn) => ({
          ...turn, status: "done", note: result.truncated ? "回答已达到长度上限，可以继续提问。" : undefined,
        }));
      }
    } catch (error) {
      if (inFlight.current?.id === id) {
        const note = error instanceof Error && !(error instanceof TypeError || error instanceof SyntaxError)
          ? error.message : "无法连接提问服务，请稍后重试。";
        updateTurn(id, (turn) => ({ ...turn, status: "error", note }));
        setQuestion((draft) => draft || prompt);
      }
    } finally {
      if (inFlight.current?.id === id) inFlight.current = null;
    }
  }

  return (
    <aside
      className="research-assistant"
      aria-label="AI 提问"
      style={positionStyle(triggerPosition)}
      data-side={dock.above ? "above" : "below"}
      data-align={dock.right ? "right" : "left"}
    >
      {open && (
        <section
          id={panelId}
          ref={panel}
          className={`research-assistant-panel${expanded ? " is-expanded" : ""}`}
          style={dialogSize}
          role="dialog"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <header className="research-assistant-header">
            <div className="research-assistant-drag-handle" title="拖动移动助手" {...dragWidget}>
              <h2 id={titleId}><Mascot />研报助手</h2>
              <GripHorizontal size={18} aria-hidden />
            </div>
            <div className="research-assistant-actions">
              {expanded && (
                <button type="button" title="新对话" aria-label="新对话" onClick={reset}>
                  <Plus size={19} aria-hidden />
                </button>
              )}
              <button type="button" title="关闭" aria-label="关闭提问窗口" onClick={close}>
                <X size={20} aria-hidden />
              </button>
            </div>
          </header>

          <div className="research-assistant-panel-body">
            {expanded && (
              <div
                className="research-assistant-transcript"
                ref={transcript}
                onScroll={(event) => {
                  const region = event.currentTarget;
                  follow.current = region.scrollHeight - region.scrollTop - region.clientHeight < 64;
                }}
                aria-label="对话记录"
                tabIndex={0}
              >
                {turns.map((turn) => (
                  <article className="research-assistant-turn" key={turn.id}>
                    <p className="research-assistant-question">{turn.question}</p>
                    {turn.answer && <p className="research-assistant-answer">{turn.answer}</p>}
                    {turn.status === "streaming" && (
                      <p className="research-assistant-status" role="status">正在生成回答…</p>
                    )}
                    {turn.status === "stopped" && <p className="research-assistant-status">已停止生成。</p>}
                    {turn.note && <p className="research-assistant-status" role={turn.status === "error" ? "alert" : "status"}>{turn.note}</p>}
                  </article>
                ))}
              </div>
            )}

            <form className="research-assistant-form" onSubmit={submit}>
              {!expanded && (
                <p className="research-assistant-hint">
                  {endpoint ? "可粘贴研报片段一起提问。问题将发送给 DeepSeek。" : "提问服务暂未连接。"}
                </p>
              )}
              <div className="research-assistant-compose">
                <textarea
                  ref={input}
                  aria-label="输入你的问题"
                  placeholder={expanded ? "继续提问…" : "输入你的问题…"}
                  maxLength={maxQuestionLength}
                  rows={expanded ? 2 : 3}
                  value={question}
                  disabled={!endpoint}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing &&
                        event.keyCode !== 229 && !streaming) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {streaming ? (
                  <button type="button" aria-label="停止生成" title="停止生成" onClick={stop}>
                    <Square size={17} aria-hidden />
                  </button>
                ) : (
                  <button type="submit" title="发送问题" aria-label="发送问题" disabled={!endpoint || !question.trim()}>
                    <ArrowUp size={20} aria-hidden />
                  </button>
                )}
              </div>
            </form>
          </div>
          <button
            className="research-assistant-resize"
            type="button"
            aria-label="调整对话框宽高"
            title="拖动或用方向键调整宽高"
            onKeyDown={(event) => {
              const delta = resizeKeys[event.key];
              const bounds = panel.current?.getBoundingClientRect();
              if (!delta || !bounds) return;
              event.preventDefault();
              changeSize(bounds, delta);
            }}
            {...dragResize}
          >
            <MoveDiagonal2 size={14} aria-hidden />
          </button>
        </section>
      )}
      <button
        type="button"
        className="research-assistant-trigger"
        ref={trigger}
        aria-label={open ? "收起 AI 提问" : "向 AI 提问"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        title={open ? "点击收起，拖动移动" : "点击提问，拖动移动"}
        {...dragWidget}
      >
        <Mascot />
      </button>
    </aside>
  );
}
