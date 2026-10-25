import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, AudioLines, Check, CheckCheck, ChevronDown, Circle, Compass, FileText, ListChecks, MessageCircle, Quote, RotateCcw, ShieldCheck, Sprout, Target } from "lucide-react";
import "../goals/goals.css";
import "./home.css";

const steps = [
  { number: "01", icon: Target, title: "Выберите, к чему идёте", text: "Одна личная цель и три понятных критерия. Так проще заметить, что действительно приближает вас к результату." },
  { number: "02", icon: AudioLines, title: "Оставьте след своего дня", text: "Добавьте текстовую заметку или короткий аудиофайл. Рядом найдёт в ваших словах планы и выполненные действия." },
  { number: "03", icon: Quote, title: "Сверьтесь с источником", text: "У каждого найденного события есть точная цитата. Для аудио можно проверить доступные таймкоды. Решение остаётся за вами." },
  { number: "04", icon: CheckCheck, title: "Подтвердите сделанное", text: "Только подтверждённые выполненные действия увеличивают прогресс. Намерения остаются планами." },
];

const questions = [
  { question: "Как Рядом помогает с навыками и решениями?", answer: "Чат находит в ваших материалах обратную связь, упоминания навыков и прошлые ситуации. По точным цитатам можно вспомнить, что уже получается, что стоит попрактиковать и какие ошибки учесть. Отдельного профиля навыков или готового плана здесь пока нет. Решение и следующие шаги остаются за вами." },
  { question: "Рядом записывает меня в фоне?", answer: "Нет. Фоновой записи нет. Вы сами добавляете текст или загружаете аудиофайл, который хотите разобрать." },
  { question: "Откуда чат берёт ответы?", answer: "Из вашей цели, заметок, расшифровок и сведений о прогрессе. Чат показывает точные цитаты. Он не ищет в интернете и не дополняет ответ внешними знаниями. Если в материалах нет ответа, он скажет об этом." },
  { question: "Все данные обрабатываются на моём устройстве?", answer: "Нет. Заметки обрабатывает настроенный серверный провайдер, а аудиофайлы проходят распознавание речи. Рядом не обещает полностью локальную обработку." },
  { question: "Можно исправить ошибочно найденное событие?", answer: "Да. Можно отклонить предложение или отменить подтверждение. Прогресс пересчитывается по оставшимся подтверждённым действиям." },
  { question: "Кто может создать аккаунт?", answer: "В этой версии новое пространство создаётся для одного владельца. Если оно уже настроено, владелец входит в свой аккаунт. Открытой регистрации для множества пользователей пока нет." },
];

function Example() {
  const [kind, setKind] = useState<"intention" | "action">("intention");
  const [confirmed, setConfirmed] = useState(false);
  const action = kind === "action";
  return <div className="rh-example">
    <div className="rh-example-top"><span className="rh-eyebrow"><Circle size={9} aria-hidden="true" /> ПОПРОБУЙТЕ НА ПРИМЕРЕ</span><span className="rh-example-label">Пример, не ваши данные</span></div>
    <div className="rh-example-grid">
      <div>
        <div className="rh-switch" role="group" aria-label="Вид события в примере">
          <button type="button" aria-pressed={!action} onClick={() => { setKind("intention"); setConfirmed(false); }}>Намерение</button>
          <button type="button" aria-pressed={action} onClick={() => { setKind("action"); setConfirmed(false); }}>Выполненное действие</button>
        </div>
        <div className="rh-example-source"><span><FileText size={16} aria-hidden="true" />Заметка из примера</span><blockquote>{action ? "«Сегодня решил пять задач по алгоритмам и разобрал ошибки»." : "«Завтра хочу решить пять задач по алгоритмам»."}</blockquote></div>
      </div>
      <div className="rh-example-result">
        <span className={`rh-event-label ${action ? "rh-event-action" : ""}`}>{action ? <CheckCheck size={16} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}{action ? "Выполненное действие" : "Намерение"}</span>
        <h3>{action ? "Пять задач решены" : "Пять задач в планах"}</h3>
        <p>{action ? "Действие уже произошло. После вашей проверки оно может пополнить прогресс." : "Это план на завтра. Он не увеличивает прогресс, даже если звучит очень уверенно."}</p>
        <div className="rh-demo-progress" role="status" aria-live="polite" aria-atomic="true"><div><span>Прогресс в примере</span><strong>{confirmed ? "1 / 1" : "0 / 1"}</strong></div><div className="rh-demo-track" aria-hidden="true"><span className={confirmed ? "is-confirmed" : ""} /></div><span>{confirmed ? "Действие подтверждено в примере" : "Подтверждённых действий пока нет"}</span></div>
        {action ? <button type="button" className={`rh-button ${confirmed ? "rh-button-secondary" : "rh-button-primary"}`} onClick={() => setConfirmed((value) => !value)}>{confirmed ? <RotateCcw size={17} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}{confirmed ? "Отменить в примере" : "Подтвердить в примере"}</button> : <div className="rh-plan-note"><ShieldCheck size={18} aria-hidden="true" /><span>План сохранится планом.<br />Прогресс ждёт выполненного действия.</span></div>}
      </div>
    </div>
    <p className="rh-demo-disclaimer">Это демонстрация на этой странице. Ваши материалы и реальный прогресс не меняются.</p>
  </div>;
}

export default function HomePage() {
  return <div className="goal-workspace home-page">
    <a className="rh-skip" href="#home-main">К содержимому</a>
    <header className="rh-header rh-container">
      <Link className="rh-brand" to="/" aria-label="Рядом — главная"><span className="rh-brand-mark"><Target size={22} aria-hidden="true" /></span>Рядом<span className="rh-brand-caption">личное пространство для движения</span></Link>
      <nav aria-label="Главная навигация"><a className="rh-nav-how" href="#how-it-works">Как это работает</a><Link to="/login">Войти<ArrowRight size={16} aria-hidden="true" /></Link></nav>
    </header>
    <main id="home-main">
      <section className="rh-hero rh-container" aria-labelledby="home-title">
        <div className="rh-hero-copy"><span className="rh-eyebrow"><span className="rh-dot" /> ВАШ ОПЫТ МОЖЕТ БЫТЬ ОПОРОЙ</span><h1 id="home-title">Цели. Навыки.<br />Решения.<br /><em>С опорой на опыт.</em></h1><p className="rh-lead">Замечайте движение к целям, находите, что стоит попрактиковать, и вспоминайте прошлые ошибки перед новым выбором. Рядом опирается на ваши заметки и аудио — с цитатами, которые можно проверить.</p><div className="rh-hero-actions"><Link className="rh-button rh-button-primary" to="/app">Открыть пространство<ArrowRight size={19} aria-hidden="true" /></Link><a className="rh-text-link" href="#directions">Найти свою задачу<ArrowDown size={16} aria-hidden="true" /></a></div><p className="rh-hero-footnote"><ShieldCheck size={15} aria-hidden="true" />Ваши материалы. Проверяемые цитаты. Решение за вами.</p></div>
        <div className="rh-hero-visual" aria-label="Иллюстрация: заметка становится подтверждённым шагом к цели. Пример, не ваши данные.">
          <div className="rh-visual-orbit" aria-hidden="true" />
          <span className="rh-visual-caption">ПРИМЕР, НЕ ВАШИ ДАННЫЕ</span>
          <div className="rh-preview-goal"><div className="rh-preview-kicker"><Target size={17} aria-hidden="true" />МОЯ ЦЕЛЬ</div><h2>Подготовиться<br />к собеседованию</h2><div className="rh-preview-criterion"><span>Практиковаться в алгоритмах</span><strong>1 из 3</strong></div><div className="rh-preview-track"><span /></div><div className="rh-preview-small">Один подтверждённый шаг уже есть.</div></div>
          <div className="rh-preview-note"><span><AudioLines size={17} aria-hidden="true" />Расшифровка · 0:12–0:18</span><p>«Сегодня решил пять задач<br />и разобрал ошибки».</p></div>
          <div className="rh-preview-confirm"><span><Check size={19} aria-hidden="true" /></span><div><strong>Это сделано.</strong><p>Вы проверили и подтвердили.</p></div><ArrowRight size={20} aria-hidden="true" /></div>
        </div>
      </section>
      <div className="rh-principle rh-container"><span>Слова остаются источником.</span><span>Решение остаётся за вами.</span><a href="#directions">Три способа опереться на опыт<ArrowDown size={16} aria-hidden="true" /></a></div>
      <section className="rh-section rh-container" id="directions" aria-labelledby="directions-title"><div className="rh-section-heading"><span className="rh-eyebrow">ТРИ ГЛАВНЫЕ ЗАДАЧИ</span><h2 id="directions-title">У вашего опыта<br />больше одного применения.</h2></div><div className="rh-usecases">
        <article className="rh-usecase"><div className="rh-usecase-top"><Target size={25} aria-hidden="true" /><span>01 / ЦЕЛИ</span></div><h3>Вижу ли я движение<br />к своей цели?</h3><p>Свяжите заметки и аудио с одной целью и тремя критериями. Проверяйте найденные события: только подтверждённые выполненные действия дают прогресс.</p><div className="rh-usecase-example"><span>ВОПРОС К СВОЕМУ ОПЫТУ</span><p>«Что я уже сделал для подготовки к собеседованию?»</p></div><Link className="rh-text-link" to="/app">Посмотреть путь к цели<ArrowRight size={17} aria-hidden="true" /></Link></article>
        <article className="rh-usecase"><div className="rh-usecase-top"><Sprout size={25} aria-hidden="true" /><span>02 / НАВЫКИ</span></div><h3>Что получается,<br />а что стоит прокачать?</h3><p>Найдите в сохранённой обратной связи свои сильные стороны и темы для точечной практики. Чат покажет ваши записи — как опору для следующего шага.</p><div className="rh-usecase-example"><span>ПРИМЕР ЗАПИСИ, НЕ ВАШИ ДАННЫЕ</span><blockquote>«На интервью мне сказали: Python объясняю уверенно, а оценку качества моделей стоит повторить».</blockquote></div><Link className="rh-text-link" to="/chat">Найти обратную связь в чате<ArrowRight size={17} aria-hidden="true" /></Link></article>
        <article className="rh-usecase"><div className="rh-usecase-top"><Compass size={25} aria-hidden="true" /><span>03 / РЕШЕНИЯ</span></div><h3>Что учесть,<br />чтобы не повторить ошибку?</h3><p>Перед новым выбором вернитесь к похожим ситуациям из своих заметок. Чат поможет вспомнить прошлый опыт и найти точную цитату. Решение принимаете вы.</p><div className="rh-usecase-example"><span>ПРИМЕР ЗАПИСИ, НЕ ВАШИ ДАННЫЕ</span><blockquote>«В прошлый раз я согласился на задачу, не уточнив объём, и сорвал срок».</blockquote></div><Link className="rh-text-link" to="/chat">Вспомнить прошлый опыт в чате<ArrowRight size={17} aria-hidden="true" /></Link></article>
      </div></section>
      <section className="rh-section rh-container" id="how-it-works" aria-labelledby="how-title"><div className="rh-section-heading"><span className="rh-eyebrow">01 / КАК ЭТО РАБОТАЕТ</span><h2 id="how-title">Не нужно помнить<br />каждый свой шаг.</h2><p>Оставьте несколько слов о том, что происходит.<br />Рядом поможет связать их с вашей целью.</p></div><ol className="rh-steps">{steps.map(({ number, icon: Icon, title, text }) => <li key={number}><div className="rh-step-top"><span>{number}</span><Icon size={23} aria-hidden="true" /></div><h3>{title}</h3><p>{text}</p></li>)}</ol></section>
      <section className="rh-section rh-container rh-demo-section" id="example" aria-labelledby="example-title"><div className="rh-section-heading rh-heading-inline"><div><span className="rh-eyebrow">02 / ПЛАН И РЕЗУЛЬТАТ</span><h2 id="example-title">«Собираюсь» — ещё не «сделал».</h2></div><p>Рядом различает намерение и действие.<br />А последнее слово всегда ваше.</p></div><Example /></section>
      <section className="rh-section rh-container" aria-labelledby="features-title"><div className="rh-section-heading"><span className="rh-eyebrow">03 / ВАШЕ ПРОСТРАНСТВО</span><h2 id="features-title">Меньше догадок.<br />Больше опоры на свои слова.</h2></div><div className="rh-features"><article className="rh-feature"><ListChecks size={26} aria-hidden="true" /><h3>Одна цель. Три ориентира.</h3><p>Сформулируйте результат и три критерия, по которым поймёте, что продвинулись. Подтверждённые действия считаются по каждому критерию.</p></article><article className="rh-feature"><AudioLines size={26} aria-hidden="true" /><h3>Написать или загрузить аудио.</h3><p>Текстовая заметка и короткий аудиофайл становятся источниками событий. У аудио сохраняется расшифровка, которую можно прочитать.</p></article><article className="rh-feature"><Quote size={26} aria-hidden="true" /><h3>Проверить, прежде чем принять.</h3><p>Откройте точную цитату и доступный таймкод аудиофрагмента. Подтвердите выполненное действие, отклоните лишнее или отмените подтверждение.</p></article></div></section>
      <section className="rh-chat-section" aria-labelledby="chat-title"><div className="rh-container rh-chat-grid"><div><span className="rh-eyebrow">04 / ЧАТ С АГЕНТОМ</span><h2 id="chat-title">Разговор,<br />который помнит<br /><em>ваши слова.</em></h2><p>Спросите о своих шагах, обратной связи по навыкам или прошлом решении. Агент отвечает только по вашим материалам и показывает цитаты, на которых основан ответ.</p><p>История разговора сохраняется. Если ответа в контексте нет, агент честно об этом скажет.</p><Link className="rh-button rh-button-secondary" to="/chat">Чат с агентом<MessageCircle size={18} aria-hidden="true" /></Link></div><div className="rh-chat-preview"><span className="rh-example-label">Пример, не ваши данные</span><div className="rh-chat-question">Что мне советовали повторить после интервью?</div><div className="rh-chat-answer"><span className="rh-chat-avatar"><MessageCircle size={18} aria-hidden="true" />Рядом</span><p>В ваших материалах есть запись:</p><blockquote>«На интервью мне сказали: Python объясняю уверенно, а оценку качества моделей стоит повторить».</blockquote><span className="rh-chat-source"><Quote size={15} aria-hidden="true" />Из вашей заметки</span></div><div className="rh-chat-boundary"><ShieldCheck size={17} aria-hidden="true" />Ваш контекст. Проверяемые цитаты.</div></div></div></section>
      <section className="rh-section rh-container rh-faq" aria-labelledby="faq-title"><div className="rh-section-heading"><span className="rh-eyebrow">ЕЩЁ НЕМНОГО ЯСНОСТИ</span><h2 id="faq-title">До первого шага.</h2></div><div>{questions.map(({ question, answer }) => <details key={question}><summary>{question}<ChevronDown size={19} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></section>
      <section className="rh-final rh-container" aria-labelledby="start-title"><span className="rh-eyebrow">ВАШ СЛЕДУЮЩИЙ ШАГ</span><h2 id="start-title">Начните с того,<br />что для вас важно.</h2><p>Цель, которую хотите приблизить. Навык, который хотите развить.<br />Решение, перед которым хочется вспомнить свой опыт.</p><Link className="rh-button rh-button-primary" to="/app">Открыть пространство<ArrowRight size={19} aria-hidden="true" /></Link></section>
    </main>
    <footer className="rh-footer rh-container"><Link className="rh-brand" to="/">Рядом<span className="rh-footer-tagline">Замечать. Проверять. Двигаться.</span></Link><Link to="/login">Войти в своё пространство<ArrowRight size={16} aria-hidden="true" /></Link></footer>
  </div>;
}
