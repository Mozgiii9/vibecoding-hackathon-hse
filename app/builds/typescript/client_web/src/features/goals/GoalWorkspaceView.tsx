import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowUpRight, Check, ChevronRight, FileText, Flag, Headphones, Plus, Sparkles, X } from "lucide-react";

import { AUDIO_MIME_TYPES, MAX_AUDIO_BYTES } from "./api";
import type { Evidence, Goal, GoalWrite } from "./api";
import type { GoalWorkspace } from "./useGoalWorkspace";
import "./goals.css";

interface GoalWorkspaceViewProps {
  workspace: GoalWorkspace;
  onLogout: () => void;
  preview?: boolean;
  onOpenAssistant?: () => void;
}

const eventLabels: Record<Evidence["eventType"], string> = {
  completed_action: "Выполненное действие",
  intention: "Намерение",
  obstacle: "Препятствие",
  uncertain: "Требует уточнения",
};
const statusLabels: Record<Evidence["status"], string> = {
  proposed: "На проверке",
  confirmed: "Подтверждено",
  rejected: "Отклонено",
  disputed: "Оспорено",
};

function dateLabel(value: string, withYear = false): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(value));
}

function timecode(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function BrandMark() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="gw-brand-mark">
    <path d="M9 24a11 11 0 0 1 22 0M20 4v4M6 10l3 3M34 10l-3 3M3 23h4M33 23h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M8 29h24M12 34h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>;
}

function GoalForm({ workspace, disabled }: { workspace: GoalWorkspace; disabled: boolean }) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [criteria, setCriteria] = useState<GoalWrite["criteria"]>([
    { id: "cv", description: "", targetCount: 1, unit: "" },
    { id: "mock", description: "", targetCount: 2, unit: "" },
    { id: "feedback", description: "", targetCount: 1, unit: "" },
  ]);
  const fillExample = () => {
    setTitle("Подготовиться к ML-собеседованию");
    setCriteria([
      { id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" },
      { id: "mock", description: "Пройти пробные интервью", targetCount: 2, unit: "интервью" },
      { id: "feedback", description: "Внести исправления по обратной связи", targetCount: 1, unit: "исправление" },
    ]);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    void workspace.saveGoal({
      title: title.trim(), deadline: deadline ? new Date(deadline).toISOString() : null,
      criteria: criteria.map((criterion) => ({ ...criterion, description: criterion.description.trim(), unit: criterion.unit.trim() })),
      confirm: true, expectedRevision: null,
    });
  };
  const updateCriterion = (index: number, change: Partial<GoalWrite["criteria"][number]>) => {
    setCriteria((current) => current.map((criterion, position) => position === index ? { ...criterion, ...change } : criterion));
  };

  return <section className="gw-onboarding" aria-labelledby="new-goal-title">
    <div className="gw-onboarding-intro">
      <span className="gw-eyebrow">НАЧНЁМ С ВАЖНОГО</span>
      <h1 id="new-goal-title">К чему хочется<br />стать ближе?</h1>
      <p>Одна цель и три понятных критерия. Потом можно добавить заметку или запись разговора и заметить свой следующий шаг.</p>
      <button type="button" className="gw-text-button" onClick={fillExample} disabled={disabled}>Заполнить пример про ML-стажировку <ArrowUpRight size={16} /></button>
      <div className="gw-onboarding-note"><BrandMark /><p>Здесь считаются действия.<br />А проверка всегда остаётся за вами.</p></div>
    </div>
    <form className="gw-goal-form" onSubmit={submit}>
      <label className="gw-field">Моя цель<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, подготовиться к собеседованию" disabled={disabled} /></label>
      <label className="gw-field">К какому сроку <span className="gw-optional">необязательно</span><input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={disabled} /></label>
      <div className="gw-form-section-heading"><h2>Как понять, что получилось</h2><span>3 критерия</span></div>
      {criteria.map((criterion, index) => <fieldset className="gw-criterion-form" key={criterion.id} disabled={disabled}>
        <legend>Критерий {index + 1}</legend>
        <label className="gw-field">Действие<input required value={criterion.description} onChange={(event) => updateCriterion(index, { description: event.target.value })} placeholder="Что нужно сделать?" /></label>
        <div className="gw-form-pair">
          <label className="gw-field">Сколько<input type="number" min={1} max={10000} required value={criterion.targetCount} onChange={(event) => updateCriterion(index, { targetCount: Number(event.target.value) })} /></label>
          <label className="gw-field">Единица<input required maxLength={60} value={criterion.unit} onChange={(event) => updateCriterion(index, { unit: event.target.value })} placeholder="интервью, отправка…" /></label>
        </div>
      </fieldset>)}
      <p className="gw-help">Подтвердите цель и критерии перед первым импортом. После добавления контекста они будут зафиксированы.</p>
      <button className="gw-button gw-button-primary" disabled={disabled} type="submit">{workspace.busy === "saving" ? "Сохраняем цель…" : "Подтвердить цель и критерии"}<ChevronRight size={17} /></button>
    </form>
  </section>;
}

function ImportForm({ workspace, goal, preview, onClose }: { workspace: GoalWorkspace; goal: Goal; preview: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<"text" | "audio">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const disabled = preview || workspace.busy !== null || workspace.status === "loading" || !goal.confirmedAt;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    if (kind === "text") void workspace.importText({ goalId: goal.id, title: title.trim(), text });
    else if (file && !fileError) void workspace.importAudio({ goalId: goal.id, title: title.trim(), file });
  };
  return <section className="gw-import" aria-labelledby="import-heading" id="gw-import">
    <div className="gw-section-heading"><div><span className="gw-eyebrow">НОВЫЙ ИСТОЧНИК</span><h2 id="import-heading">Что произошло?</h2></div><button className="gw-icon-button" type="button" aria-label="Закрыть форму добавления контекста" onClick={onClose}><X size={20} /></button></div>
    <p className="gw-help">Добавьте заметку, сообщение или запись. Сначала проверим, какие события относятся к вашей цели.</p>
    <div className="gw-segmented" aria-label="Формат источника">
      <button type="button" aria-pressed={kind === "text"} onClick={() => setKind("text")}><FileText size={16} />Текст</button>
      <button type="button" aria-pressed={kind === "audio"} onClick={() => setKind("audio")}><Headphones size={16} />Аудио</button>
    </div>
    <form onSubmit={submit}>
      <label className="gw-field">Название источника<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={disabled} placeholder="Например, сообщение после интервью" /></label>
      {kind === "text" ? <label className="gw-field">Текст источника<textarea required maxLength={50000} rows={5} value={text} onChange={(event) => setText(event.target.value)} disabled={disabled} placeholder="Вставьте исходный текст без изменений…" /><span className="gw-help">До 50 000 символов. Цитата сохранит связь с оригиналом.</span></label> : <div className="gw-audio-input"><label className="gw-field">Аудиофайл<input type="file" required accept={AUDIO_MIME_TYPES.join(",")} disabled={disabled} aria-describedby="gw-audio-help" onChange={(event) => {
        const selected = event.target.files?.[0] ?? null;
        setFile(selected);
        setFileError(selected && selected.size > MAX_AUDIO_BYTES ? "Файл больше 10 МиБ. Выберите запись поменьше." : selected && !(AUDIO_MIME_TYPES as readonly string[]).includes(selected.type) ? "Нужен файл WAV, MP3, M4A или WebM." : null);
      }} /></label><p className="gw-help" id="gw-audio-help">WAV, MP3, M4A или WebM, до 10 МиБ. Для короткой записи до двух минут. Будет сохранена расшифровка, исходное аудио не сохраняется. Распознавание зависит от настройки сервера.</p>{fileError && <p className="gw-field-error" role="alert">{fileError}</p>}</div>}
      <div className="gw-form-footer"><span className="gw-help">Прогресс изменится после вашего подтверждения.</span><button type="submit" className="gw-button gw-button-primary" disabled={disabled || (kind === "audio" && (!file || !!fileError))}>{workspace.busy === "importing" ? "Обрабатываем источник…" : "Найти события"}<ArrowUpRight size={16} /></button></div>
    </form>
  </section>;
}

/** A source-backed goal workspace; all mutations and progress remain owned by the supplied hook. */
export default function GoalWorkspaceView({ workspace, onLogout, preview = false, onOpenAssistant }: GoalWorkspaceViewProps) {
  const [filter, setFilter] = useState<"all" | "review">("all");
  const [importOpen, setImportOpen] = useState(false);
  const sourceRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const { goal, evidence, progress, source, selectedEvidenceId, hasLoaded, busy, status, error, notice } = workspace;
  const selectedEvidence = evidence.find((item) => item.id === selectedEvidenceId);
  const reviewCount = evidence.filter((item) => item.status === "proposed" || item.status === "disputed").length;
  const visibleEvidence = filter === "all" ? evidence : evidence.filter((item) => item.status === "proposed" || item.status === "disputed");
  const disabled = preview || busy !== null || status === "loading";
  const sourceMatches = !!source && !!selectedEvidence && source.id === selectedEvidence.sourceId;
  const quoteMatches = sourceMatches && source.text.slice(selectedEvidence.textStart, selectedEvidence.textEnd) === selectedEvidence.quote;
  const openImport = () => {
    setImportOpen(true);
    requestAnimationFrame(() => {
      importRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
      importRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  };
  const openSource = (item: Evidence) => {
    workspace.selectEvidence(item.id);
    requestAnimationFrame(() => {
      sourceRef.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 1099px)").matches) sourceRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };
  const review = (item: Evidence, reviewStatus: Evidence["status"]) => {
    if (!disabled) void workspace.reviewEvidence(item.id, { status: reviewStatus, expectedRevision: item.revision });
  };

  return <div className="goal-workspace">
    <a className="gw-skip-link" href="#gw-main">К содержимому</a>
    <header className="gw-topbar">
      <a className="gw-brand" href="/" aria-label="Рядом — о сервисе"><BrandMark /><span>Рядом<span className="gw-brand-description">Второй мозг</span></span></a>
      <div className="gw-topbar-actions">
        {onOpenAssistant && <button type="button" className="gw-text-button gw-assistant" onClick={onOpenAssistant}><Sparkles size={16} aria-hidden="true" />Чат с агентом</button>}
        <button type="button" className="gw-button gw-button-primary" onClick={openImport} disabled={!goal?.confirmedAt || disabled}><Plus size={18} />Добавить контекст</button>
        <button type="button" className="gw-text-button gw-logout" onClick={onLogout}>Выйти</button>
      </div>
    </header>
    <main id="gw-main" className="gw-main">
      {preview && <div className="gw-demo-banner"><span className="gw-demo-dot" />Демо-макет · синтетические данные<span>Можно выбирать события и читать источники</span></div>}
      {(error || notice || busy) && <div className="gw-notifications" aria-live="polite">
        {error && <div className="gw-error" role="alert"><div><strong>Не получилось завершить запрос</strong><p>{error}</p></div>{error.includes("Сессия истекла") ? <button type="button" className="gw-button gw-button-secondary" onClick={onLogout}>Войти снова</button> : <button type="button" className="gw-text-button" disabled={busy !== null} onClick={() => void workspace.refresh()}>Обновить данные <ArrowUpRight size={16} /></button>}</div>}
        {notice && <p className="gw-notice">{notice}</p>}
        {busy && <p className="gw-busy"><span className="gw-busy-dot" />{busy === "importing" ? "Ищем события в источнике. Это может занять немного времени." : busy === "reviewing" ? "Сохраняем проверку и обновляем прогресс…" : "Сохраняем вашу цель…"}</p>}
      </div>}
      {!goal && !hasLoaded && status === "loading" ? <div className="gw-loading" aria-label="Загружаем цель" role="status"><span>Собираем ваш контекст…</span><div className="gw-skeleton gw-skeleton-heading" /><div className="gw-skeleton-columns">{[0, 1, 2].map((item) => <div className="gw-skeleton" key={item} />)}</div></div> : !goal ? hasLoaded ? <GoalForm workspace={workspace} disabled={disabled} /> : null : <>
        <div className="gw-greeting"><p>Маленькие шаги тоже считаются</p><span className="gw-greeting-line" /><span className="gw-greeting-caption">Ваш путь к важному</span></div>
        <div ref={importRef} hidden={!importOpen}><ImportForm workspace={workspace} goal={goal} preview={preview} onClose={() => setImportOpen(false)} /></div>
        {!goal.confirmedAt && <section className="gw-confirm-goal"><div><h2>Подтвердим точку назначения?</h2><p>Проверьте цель и три критерия ниже. После подтверждения можно добавить контекст.</p></div><button type="button" className="gw-button gw-button-primary" disabled={disabled} onClick={() => void workspace.saveGoal({ title: goal.title, deadline: goal.deadline, criteria: goal.criteria, confirm: true, expectedRevision: goal.revision })}>Подтвердить цель <Check size={16} /></button></section>}
        <div className="gw-workspace-grid" aria-busy={status === "loading" || busy !== null}>
          <aside className="gw-goal-column" aria-labelledby="gw-goal-title">
            <div className="gw-goal-eyebrow"><span className="gw-eyebrow">МОЯ ЦЕЛЬ</span><Flag size={16} /></div>
            <h1 id="gw-goal-title">{goal.title}</h1>
            <p className="gw-deadline">{goal.deadline ? <>К <time dateTime={goal.deadline}>{dateLabel(goal.deadline, true)}</time></> : "В своём темпе, без срока"}</p>
            <div className="gw-criteria-heading"><h2>Мои ориентиры</h2><span>{goal.criteria.length}</span></div>
            <ol className="gw-criteria">
              {goal.criteria.map((criterion, index) => {
                const item = progress?.criteria.find((entry) => entry.criterionId === criterion.id);
                return <li key={criterion.id} className={item?.complete ? "is-complete" : ""}>
                  <span className="gw-criterion-number">{item?.complete ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span>
                  <div className="gw-criterion-content"><h3>{criterion.description}</h3><div className="gw-criterion-count"><span>{item ? <><strong>{item.confirmedCount}</strong> / {item.targetCount}</> : "Загружаем…"}</span><span>{criterion.unit}</span></div>{item && <div className="gw-progress-track" role="progressbar" aria-label={criterion.description} aria-valuemin={0} aria-valuemax={item.targetCount} aria-valuenow={Math.min(item.confirmedCount, item.targetCount)} aria-valuetext={`${item.confirmedCount} из ${item.targetCount}, ${criterion.unit}`}><span style={{ width: `${Math.min(100, (item.confirmedCount / item.targetCount) * 100)}%` }} /></div>}</div>
                </li>;
              })}
            </ol>
            <p className="gw-progress-explanation"><Check size={13} />По подтверждённым событиям</p>
            <div className="gw-next-step"><div className="gw-next-heading"><span className="gw-eyebrow">БЛИЖАЙШИЙ ШАГ</span><ArrowUpRight size={19} /></div>{progress?.nextStep ? <><p>{progress.nextStep.text}</p><span className="gw-help">{progress.nextStep.kind === "rule" ? "По первому незакрытому критерию" : "Предложение модели, решение за вами"}</span></> : progress && progress.criteria.length > 0 && progress.criteria.every((item) => item.complete) ? <><p>Все ориентиры достигнуты.</p><span className="gw-help">Вы подтвердили действия для каждого критерия.</span></> : <p className="gw-help">Добавьте контекст, чтобы увидеть события на пути к цели.</p>}</div>
          </aside>
          <section className="gw-events-column" aria-labelledby="gw-events-title">
            <div className="gw-events-heading"><div><span className="gw-eyebrow">ИЗ ВАШЕГО КОНТЕКСТА</span><h2 id="gw-events-title">Шаг за шагом<span className="gw-event-total">{evidence.length}</span></h2></div><span className="gw-tiny-sun" aria-hidden="true">✳</span></div>
            <p className="gw-events-intro">События, которые могут быть связаны с целью.<br />Вы решаете, что считать шагом вперёд.</p>
            <div className="gw-event-filters" role="group" aria-label="Фильтр событий"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Все события</button><button type="button" aria-pressed={filter === "review"} onClick={() => setFilter("review")}>На проверке <span>{reviewCount}</span></button></div>
            {visibleEvidence.length ? <ol className="gw-events-list">{visibleEvidence.map((item) => <li key={item.id} className={`gw-event gw-event-${item.eventType} ${item.id === selectedEvidenceId ? "is-selected" : ""}`}>
              <div className="gw-event-symbol" aria-hidden="true">{item.status === "confirmed" ? <Check size={17} /> : item.eventType === "intention" ? <span>↗</span> : item.eventType === "obstacle" ? <Flag size={16} /> : item.eventType === "uncertain" ? <span>?</span> : <span className="gw-unchecked" />}</div>
              <div className="gw-event-content"><div className="gw-event-meta"><span className={`gw-type gw-type-${item.eventType}`}>{eventLabels[item.eventType]}</span><span className={`gw-status gw-status-${item.status}`}>{statusLabels[item.status]}</span></div><h3>{item.summary}</h3><p className="gw-event-criterion">{goal.criteria.find((criterion) => criterion.id === item.criterionId)?.description ?? "Критерий цели"}</p>
                {item.eventType !== "completed_action" && <p className="gw-event-note">{item.eventType === "intention" ? "Пока это план. В прогрессе не учитывается." : item.eventType === "obstacle" ? "Помогает понять контекст. В прогрессе не учитывается." : "Недостаточно данных о выполненном действии."}</p>}
                <div className="gw-event-actions"><button type="button" className="gw-source-button" onClick={() => openSource(item)} aria-controls="gw-source" aria-expanded={item.id === selectedEvidenceId}><FileText size={14} />{item.id === selectedEvidenceId ? "Источник открыт" : "Посмотреть источник"}<ArrowUpRight size={14} /></button>
                  {!preview && <div className="gw-review-actions">{item.eventType === "completed_action" && item.status !== "confirmed" && <button className="gw-confirm-button" type="button" disabled={disabled} onClick={() => review(item, "confirmed")}><Check size={14} />Подтвердить</button>}{item.status !== "rejected" && <button type="button" className="gw-review-button" disabled={disabled} onClick={() => review(item, "rejected")}>Отклонить</button>}{item.status !== "disputed" && <button type="button" className="gw-review-button" disabled={disabled} onClick={() => review(item, "disputed")}>Оспорить</button>}</div>}
                </div>
              </div>
            </li>)}</ol> : <div className="gw-empty-events"><span className="gw-empty-symbol"><FileText size={25} /></span><h3>{filter === "review" ? "Всё проверено" : "У каждого шага есть история"}</h3><p>{filter === "review" ? "Здесь появятся новые события, которые ждут вашего решения." : "Добавьте заметку или сообщение. Найденные события появятся здесь, а рядом можно будет прочитать точную цитату."}</p>{filter === "review" ? <button type="button" className="gw-text-button" onClick={() => setFilter("all")}>Показать все события <ArrowUpRight size={16} /></button> : <button type="button" className="gw-text-button" disabled={!goal.confirmedAt || disabled} onClick={openImport}>Добавить первый контекст <Plus size={16} /></button>}</div>}
            <div className="gw-events-footnote"><span className="gw-footnote-line" /><p>Сначала контекст. Потом выводы.</p></div>
          </section>
          <aside id="gw-source" ref={sourceRef} tabIndex={-1} className={`gw-source-column ${selectedEvidence ? "has-source" : ""}`} aria-labelledby="gw-source-heading" aria-live="polite">
            <div className="gw-source-heading"><h2 id="gw-source-heading">За каждым шагом<br />есть источник</h2><ArrowDown size={18} /></div>
            {selectedEvidence ? sourceMatches ? <>
              <div className="gw-source-meta"><span className="gw-source-kind">{source.kind === "audio" ? <Headphones size={14} /> : <FileText size={14} />}{source.kind === "audio" ? "Расшифровка" : "Текст"}</span><time dateTime={source.capturedAt ?? source.createdAt}>{dateLabel(source.capturedAt ?? source.createdAt)}</time></div>
              <h3 className="gw-source-title">{source.title || "Источник без названия"}</h3>
              {selectedEvidence.startMs !== null && <p className="gw-source-timecode">Фрагмент {timecode(selectedEvidence.startMs)}{selectedEvidence.endMs !== null ? ` – ${timecode(selectedEvidence.endMs)}` : ""}</p>}
              <div className="gw-source-document"><span className="gw-quote-symbol" aria-hidden="true">“</span>{quoteMatches ? <p>{source.text.slice(0, selectedEvidence.textStart)}<mark>{source.text.slice(selectedEvidence.textStart, selectedEvidence.textEnd)}</mark>{source.text.slice(selectedEvidence.textEnd)}</p> : <><p>{source.text}</p><p className="gw-field-error">Не удалось сопоставить цитату с этим источником. Обновите данные перед проверкой.</p></>}</div>
              <div className="gw-source-legend"><span />Выделен фрагмент выбранного события</div><p className="gw-source-trust">Можно вернуться к словам,<br />на которых основан вывод.</p>
            </> : <div className="gw-source-loading" role="status"><p>Открываем исходный текст…</p><div className="gw-skeleton" /><div className="gw-skeleton" /><div className="gw-skeleton" /></div> : <div className="gw-source-empty"><div className="gw-paper-lines" aria-hidden="true"><span /><span /><span /><span /></div><p>Выберите «Посмотреть источник» у события.</p><span>Здесь появится исходный текст с выделенной цитатой. Без догадок о том, что было сказано.</span></div>}
          </aside>
        </div>
      </>}
      <footer className="gw-footer"><span>Рядом с тем, что для вас важно.</span><span>Контекст → событие → ваше решение</span></footer>
    </main>
  </div>;
}
