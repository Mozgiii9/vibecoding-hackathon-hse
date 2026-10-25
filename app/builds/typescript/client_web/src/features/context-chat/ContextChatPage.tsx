import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowLeft, ArrowUp, FileText, Headphones, MessageCircle, Plus, RotateCcw, ShieldCheck, Square, Target, TrendingUp } from "lucide-react";
import { MAX_MESSAGE_LENGTH } from "./api";
import type { ContextChatCitation } from "./api";
import { useContextChat } from "./useContextChat";
import type { ContextChatDraft } from "./useContextChat";
import "../goals/goals.css";
import "./context-chat.css";

interface Props {
  goalId: string;
  draft: ContextChatDraft;
  onDraftChange: (draft: ContextChatDraft) => void;
  onBack: () => void;
  onLogout: () => void;
}

const kinds = { text: "Заметка", audio: "Расшифровка", goal: "Цель", progress: "Прогресс" };
const kindIcons = { text: FileText, audio: Headphones, goal: Target, progress: TrendingUp };
const timecode = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const sourceCount = (count: number) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? "источник" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "источника" : "источников"}`;

function Citation({ citation, index }: { citation: ContextChatCitation; index: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const Icon = kindIcons[citation.kind];
  return <div className="cc-citation">
    <button type="button" className="cc-citation-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
      <Icon size={15} aria-hidden="true" /><span>Источник {index + 1}: {citation.sourceTitle || kinds[citation.kind]}</span>
    </button>
    {open && <section className="cc-citation-detail" id={id} aria-label={`Цитата: ${citation.sourceTitle || kinds[citation.kind]}`}>
      <div className="cc-citation-meta"><span>{kinds[citation.kind]}</span>{citation.kind === "audio" && citation.startMs !== null && <span>Фрагмент {timecode(citation.startMs)}{citation.endMs !== null ? ` – ${timecode(citation.endMs)}` : ""}</span>}</div>
      <h3>{citation.sourceTitle || "Источник без названия"}</h3>
      <blockquote>{citation.quote}</blockquote>
    </section>}
  </div>;
}

/** A plain-text, source-backed conversation. General agent tools are never used here. */
export default function ContextChatPage({ goalId, draft, onDraftChange, onBack, onLogout }: Props) {
  const chat = useContextChat(goalId, draft, onDraftChange);
  const heading = useRef<HTMLHeadingElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const messages = chat.thread?.messages ?? [];
  const context = chat.thread?.context;
  const available = !!chat.thread && !chat.loading;
  const canSend = available && !chat.sending && !!draft.text.trim() && draft.text.length <= MAX_MESSAGE_LENGTH;
  const suggestions = context?.hasContext
    ? ["Какие шаги к цели уже сделаны?", "Что я планировал сделать?", "Что есть в моих записях по этой цели?"]
    : ["Какая у меня цель?", "Что я уже сделал?", "Что я планировал сделать?"];

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { latest.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }, [messages.length, chat.sending]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canSend) void chat.send().then(() => composer.current?.focus({ preventScroll: true }));
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
      event.preventDefault();
      submit();
    }
  };

  return <div className="goal-workspace context-chat">
    <a className="gw-skip-link" href="#context-chat-main">К разговору</a>
    <header className="cc-topbar">
      <button type="button" className="cc-back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />К моей цели</button>
      <span className="cc-brand">Рядом<span>Чат с агентом</span></span>
      <button type="button" className="gw-text-button" onClick={onLogout}>Выйти</button>
    </header>
    <main id="context-chat-main" className="cc-main">
      <div className="cc-heading">
        <div className="cc-agent-mark"><MessageCircle size={22} aria-hidden="true" /></div>
        <div><h1 ref={heading} tabIndex={-1}>Чат с агентом</h1><p>Отвечаю по вашей цели, заметкам и расшифровкам</p></div>
      </div>
      <div className="cc-context" aria-label="Контекст разговора">
        <Target size={15} aria-hidden="true" /><span>{context?.goalTitle ?? (chat.loading ? "Загружаем вашу цель…" : "Цель ещё не задана")}</span>
        {context && <span className="cc-source-count">{sourceCount(context.sourceCount)}</span>}
      </div>
      <section className="cc-conversation" aria-label="История разговора" aria-busy={chat.loading}>
        {chat.loading && !chat.thread && <div className="cc-loading" role="status">Открываем ваш разговор…</div>}
        {available && messages.length === 0 && <div className="cc-welcome">
          <span className="gw-eyebrow">ТОЛЬКО ВАШ КОНТЕКСТ</span>
          <h2>{context?.hasContext ? "С чего начнём?" : "Сначала — немного о вас"}</h2>
          <p>{context?.hasContext ? "Можно спросить о сделанных шагах, планах и том, что вы уже записали. У ответа будут источники." : "Добавьте цель, заметку или расшифровку. Тогда я смогу ответить по вашим словам и показать, на чём основан ответ."}</p>
          {!context?.hasContext && <button type="button" className="gw-button gw-button-primary" onClick={onBack}><Plus size={17} aria-hidden="true" />Добавить контекст к цели</button>}
          <div className="cc-suggestions" aria-label="Примеры вопросов">{suggestions.map((text) => <button type="button" key={text} onClick={() => { chat.edit(text); composer.current?.focus(); }}>{text}<ArrowUp size={15} aria-hidden="true" /></button>)}</div>
        </div>}
        <ol className="cc-messages" aria-label="Сообщения" aria-live="polite" aria-relevant="additions">
          {messages.map((message) => <li className={`cc-message cc-message-${message.role}`} key={message.id}>
            <span className="cc-speaker">{message.role === "user" ? "Вы" : "Рядом"}</span>
            <div className="cc-bubble"><p>{message.text}</p></div>
            {message.role === "assistant" && message.citations.length > 0 && <div className="cc-citations" aria-label="Источники ответа">{message.citations.map((citation, index) => <Citation key={`${message.id}-${index}`} citation={citation} index={index} />)}</div>}
            {message.outcome === "insufficient_context" && <button type="button" className="cc-add-context" onClick={onBack}><Plus size={16} aria-hidden="true" />Добавить контекст к цели</button>}
          </li>)}
          {chat.sending && <li className="cc-message cc-message-user" aria-label="Отправляемое сообщение"><span className="cc-speaker">Вы</span><div className="cc-bubble"><p>{draft.text.trim()}</p></div></li>}
        </ol>
        {chat.sending && <div className="cc-waiting" role="status"><span className="cc-waiting-dot" />Ищу ответ в вашем контексте…</div>}
        <div ref={latest} className="cc-latest" />
      </section>
      <div className="cc-composer-area">
        {chat.error && <div className="cc-error" role="alert"><p id="context-chat-error">{chat.error.message}</p>{chat.error.unauthorized
          ? <button type="button" onClick={onLogout}>Войти снова</button>
          : !chat.thread && <button type="button" onClick={() => void chat.refresh()}><RotateCcw size={15} aria-hidden="true" />Загрузить разговор снова</button>}</div>}
        <form className="cc-composer" onSubmit={submit} aria-label="Новое сообщение">
          <label htmlFor="context-chat-input">Ваше сообщение</label>
          <textarea id="context-chat-input" ref={composer} value={draft.text} maxLength={MAX_MESSAGE_LENGTH} rows={2} placeholder="Спросите о своей цели или записях…" disabled={!available || chat.sending || !!chat.error?.unauthorized} aria-describedby={`context-chat-hint${chat.error ? " context-chat-error" : ""}`} onChange={(event) => chat.edit(event.target.value)} onKeyDown={keyDown} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
          <div className="cc-composer-footer"><span id="context-chat-hint">Enter — отправить · Shift + Enter — новая строка</span>{chat.sending
            ? <button type="button" className="cc-send cc-cancel" onClick={chat.cancel} aria-label="Остановить ответ"><Square size={17} aria-hidden="true" /></button>
            : <button type="submit" className="cc-send" disabled={!canSend || !!chat.error?.unauthorized} aria-label={chat.error && available ? "Отправить сообщение снова" : "Отправить сообщение"}><ArrowUp size={20} aria-hidden="true" /></button>}</div>
        </form>
        <p className="cc-scope-note"><ShieldCheck size={13} aria-hidden="true" />Если в ваших источниках нет ответа, я скажу об этом.</p>
      </div>
    </main>
  </div>;
}
