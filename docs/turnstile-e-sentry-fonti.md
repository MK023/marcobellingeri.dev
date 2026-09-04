# Turnstile 300031 e rumore Sentry, cosa dicono le fonti primarie

> Nota di ricerca, non un ADR: qui non si decide niente, si mette agli atti **cosa affermano le
> fonti ufficiali** su tre domande aperte, e cosa invece resta inferenza. Scritta il
> **04-09-2026**. Fonti ammesse: `developers.cloudflare.com`, `docs.sentry.io`, i changelog
> ufficiali e il codice di `getsentry/sentry-javascript` letto al tag installato. Il forum
> `community.cloudflare.com` è contenuto scritto dagli utenti, non documentazione: **non è stato
> usato come prova** (compare un solo thread sul 300031, e la sua descrizione non è confermata da
> nessuna pagina ufficiale).
> Convenzione: ogni affermazione porta il link accanto. Ciò che deduco sta **solo** nell'ultima
> sezione.

---

## 1. Cloudflare Turnstile, il codice 300031

### Cosa dice la doc

**Il codice `300031` non è documentato individualmente.** La tabella ufficiale dei codici
d'errore client-side elenca l'intera famiglia in una riga sola, con l'asterisco che dichiara
esplicitamente le cifre finali come dettaglio interno
([Error codes](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/),
ultimo aggiornamento dichiarato in pagina: 5 maggio 2026):

> **Note** — When an error code is marked with `*`, the remaining digits can vary and are for
> internal use.

| Error Code | Description | Retry | Troubleshooting |
| --- | --- | --- | --- |
| `300*` | Generic challenge failure | Yes | Bot behavior detected. Refer to troubleshooting. |

La stessa riga esiste identica per `600*`. Le altre righe della tabella (110100, 110110, 110200,
110600, 110620, 200100, 200500, 400020, 400070) sono codici pieni e non ci riguardano.

**Causa secondo la fonte**: `Bot behavior detected`, e la colonna *Retry* dice `Yes`. La pagina
[Client-side errors](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/)
conferma la lettura per famiglia:

> An error callback will retrieve an error code as its first parameter. This error code follows a
> structured format where the first three digits indicate the error family (such as configuration
> issues, network problems, or challenge failures), and the remaining digits specify the exact
> error within that family.

e nel proprio esempio raggruppa `300` e `600` sotto un unico messaggio per il visitatore:
`'Security check failed. Please try refreshing or using a different browser.'`

**Azionabilità**: le sette raccomandazioni di troubleshooting della pagina sono **tutte rivolte al
visitatore**, non al sito — verificare la compatibilità del browser, disattivare le estensioni,
abilitare JavaScript, provare la modalità in incognito, provare un altro browser o dispositivo,
evitare VPN e proxy, cambiare rete. Nessuna riguarda la configurazione della sitekey, del dominio
o del widget: quei casi hanno codici propri e non ritentabili (`110100`, `110200`, `400070`).

**Soppressione**: Cloudflare **non documenta** alcun modo di sopprimere un `300*`. L'unico
precedente esplicito di "rumore atteso, ignoratelo" nella doc riguarda un altro errore, il `401`
in console, e vale la pena citarlo perché mostra come Cloudflare scrive quando *intende* dire
"ignoralo" — e non lo scrive per i `300*`:

> Turnstile may occasionally generate a `401` Unauthorized error in your browser console during a
> security check. This is not typically a problem with your implementation. […] You can generally
> safely ignore the `401` error, as it is an expected part of Turnstile's underlying Challenge
> Platform workflow.

L'unico canale ufficiale per contestare un `300*` su un utente vero è il
[feedback report](https://developers.cloudflare.com/turnstile/troubleshooting/feedback-reports/),
citato dalla pagina
[Challenge solve issues](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/):
*"contact the website administrator with the error code and Ray ID or submit a feedback report"*.

### Non documentato

- Il significato delle ultime due cifre (`31`). Dichiarato *"for internal use"*, quindi non c'è
  una risposta da cercare: non esiste.
- Se il `300*` distingua un falso positivo da un bot vero. La doc dice solo `Bot behavior detected`.
- Un tasso atteso. La sezione
  [Turnstile Analytics / Challenge outcome](https://developers.cloudflare.com/turnstile/turnstile-analytics/challenge-outcomes/)
  esiste per misurare il proprio solve rate, ma nessuna pagina dichiara una soglia di normalità.

---

## 2. Cosa sopprime davvero `return true` dalla error-callback

### Cosa dice la doc, alla lettera

Fonte unica:
[Client-side errors](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/).
Tre affermazioni, in quest'ordine:

> Specifying an error callback is optional, but recommended for production applications. **If no
> error callback is set, Turnstile will throw a JavaScript exception upon error**, which can
> disrupt your page's functionality and create a poor user experience. By providing an error
> callback, you can catch these exceptions and handle them.

> **If an error callback returns with a non-falsy result, Turnstile will assume that the error
> callback handled the error accordingly and will not perform any additional error logging.** If
> the error callback returns with a falsy result (including `undefined`), Turnstile will log a
> warning to the JavaScript console containing the error code, which can be useful for debugging
> during development.

La pagina di riferimento dei parametri
([Widget configurations](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/))
non aggiunge nulla: descrive `error-callback` / `data-error-callback` in una riga sola —

> A JavaScript callback invoked when there is an error (e.g. network error or the challenge
> failed). Refer to Client-side errors.

— e rimanda alla pagina di cui sopra.

### Il perimetro della soppressione **non è documentato**

Questo è il punto della domanda, e la risposta è netta: **la doc non dichiara mai il perimetro**.
Dice cosa il valore di ritorno *evita* (`additional error logging`, contrapposto al `warning to
the JavaScript console`), e in un altro paragrafo dice cosa succede *in assenza* di callback (un
throw). **Non dice** se il throw sia lo stesso meccanismo dell'`error logging`, né se un throw
originato altrove dentro `api.js` sia coperto dal ritorno non-falsy. Nessuna pagina Turnstile
descrive la struttura interna dello script, né l'esistenza di un watchdog o di un `setInterval`.

Il pezzo di doc più vicino al comportamento osservato in produzione è invece la sezione **Retry**,
che afferma che l'errore continua a vivere dopo la callback:

> By default, Turnstile will automatically retry upon encountering a problem […] When subsequent
> failures due to retries are observed, **the error callback can be invoked multiple times for the
> same underlying issue**. Your error handling code should account for this possibility […]

e documenta i due controlli disponibili: `retry: 'never'` (default `auto`) e `retry-interval`.
Sono le uniche leve documentate che cambiano *quante volte* il percorso d'errore viene ripercorso.

### Cosa fa `browserApiErrors`, dal codice

Codice letto al tag della versione installata,
[`10.70.0`, `packages/browser/src/integrations/browserapierrors.ts`](https://github.com/getsentry/sentry-javascript/blob/10.70.0/packages/browser/src/integrations/browserapierrors.ts)
(verificato: identico a `develop` a meno del path di import di `@sentry/core`). Nel repo:
`@sentry/browser` e `@sentry/astro` sono entrambi a `10.70.0`.

L'integrazione è attiva di default
([BrowserApiErrors](https://docs.sentry.io/platforms/javascript/guides/astro/configuration/integrations/browserapierrors/):
*"This integration is enabled by default"*) e avvolge, con le opzioni tutte a `true` di partenza:

| Opzione | Cosa fa nel codice |
| --- | --- |
| `setTimeout` | `fill(WINDOW, 'setTimeout', _wrapTimeFunction)` |
| `setInterval` | `fill(WINDOW, 'setInterval', _wrapTimeFunction)` |
| `requestAnimationFrame` | `fill(WINDOW, 'requestAnimationFrame', _wrapRAF)` |
| `XMLHttpRequest` | `fill(XMLHttpRequest.prototype, 'send', …)`, e dentro `onload` / `onerror` / `onprogress` / `onreadystatechange` |
| `eventTarget` | `addEventListener` / `removeEventListener` su 31 prototipi (`EventTarget`, `Window`, `Node`, `XMLHttpRequest`, …); accetta `boolean` **o** `string[]` per restringere la lista |
| `unregisterOriginalCallbacks` | default `false`, riguarda le doppie invocazioni, non la cattura |

Il wrapping di `setInterval` marca l'eccezione come **non gestita**, ed è questo che decide come
arriva a Sentry:

```js
function _wrapTimeFunction(original) {
  return function (...args) {
    args[0] = wrap(args[0], {
      mechanism: { handled: false, type: `auto.browser.browserapierrors.${getFunctionName(original)}` },
    });
    return original.apply(this, args);
  };
}
```

**È disattivabile selettivamente**, ed è documentato: si ripassa l'integrazione con le sole
opzioni volute, come nell'esempio della pagina ufficiale (che le elenca tutte e sei). Spegnere
`setInterval: false` lascia in piedi `setTimeout`, `requestAnimationFrame`, `XMLHttpRequest` e gli
event listener. Il modo di sostituire un'integrazione di default è a sua volta documentato
([Integrations / modifying default integrations](https://docs.sentry.io/platforms/javascript/guides/astro/configuration/integrations/)).

Filtri alternativi, che non spengono niente di strutturale, dalla stessa doc
([Options](https://docs.sentry.io/platforms/javascript/guides/astro/configuration/options/)):

- `ignoreErrors` — *"A list of strings or regex patterns that match error messages that shouldn't
  be sent to Sentry. […] When using strings, partial matches will be filtered out, so if you need
  to filter by exact match, use regex patterns instead."*
- `denyUrls` — *"errors will not be sent when the top stack frame file URL contains or matches at
  least one entry"*, con l'avvertenza esplicita: *"This option checks the source file URL in the
  stack trace, not the HTTP URL where the error was reported."*

---

## 3. Tenere localhost fuori dal progetto di produzione

### (a) `environment` con `@sentry/astro`, e il default

`environment` è una **opzione di `Sentry.init`**, non una configurazione dell'integrazione Astro.
La guida Astro non ha una pagina dedicata agli environment: l'URL `.../configuration/environments/`
reindirizza a
[Options](https://docs.sentry.io/platforms/javascript/guides/astro/configuration/options/), dove
la voce dice:

| | |
| --- | --- |
| Type | `string` |
| Default | `production` |
| ENV Variable | `SENTRY_ENVIRONMENT` |

> Sets the environment. Defaults to `development` or `production` depending on whether the
> application is packaged.
> […] Sentry automatically creates an environment when it receives an event with the environment
> parameter set.
> Environments are case-sensitive. The environment name can't contain newlines, spaces or forward
> slashes, can't be the string "None", or exceed 64 characters. You can't delete environments, but
> you can hide them.

La riga della tabella e la frase discorsiva **si contraddicono** (`production` contro *"development
or production depending on whether the application is packaged"*). Il codice installato scioglie
il dubbio per il nostro caso: `node_modules/@sentry/core/build/cjs/constants.js:3` definisce
`const DEFAULT_ENVIRONMENT = "production"`, e `client.js:350` lo applica come fallback
(`environment: clientEnvironmentOption = constants.DEFAULT_ENVIRONMENT`). Nel bundle browser non
esiste alcun ramo "packaged": **il default è `production`, sempre.** È questo che spiega i 12
eventi da `localhost:8788` etichettati `production`.

**La riga `ENV Variable: SENTRY_ENVIRONMENT` non vale per questo bundle.** Verificato sul codice
installato: l'unico simbolo che contiene quella stringa in `@sentry/core`, `@sentry/browser`,
`@sentry/astro` e `@sentry/cloudflare` è `SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT = "sentry.environment"`
(`semanticAttributes.js:13`), che è il nome di un attributo di span. Nessuno dei quattro pacchetti
legge `process.env.SENTRY_ENVIRONMENT`. Coerente: nel browser `process.env` non esiste.

**Lettura dell'ambiente a build time, scenario statico su Workers**: la documentazione Sentry per
Astro **non lo documenta**. L'unica cosa che la guida
[Manual Setup](https://docs.sentry.io/platforms/javascript/guides/astro/manual-setup/) dice sulle
variabili d'ambiente riguarda `SENTRY_AUTH_TOKEN`, cioè il *plugin di build* per il caricamento
delle source map, non `Sentry.init`:

> To keep your auth token secure, set the `SENTRY_AUTH_TOKEN` environment variable in your build
> environment […] Vite doesn't automatically load `.env` files into `process.env` when evaluating
> the config file.

Non c'è una parola su come popolare `environment` nel client in un build statico, né su `wrangler
dev`, né su `import.meta.env`. Il resto sta nella sezione inferenze.

### (b) Come non mandare eventi da localhost / in sviluppo

Quattro strade compaiono nelle fonti. **La sola che Sentry raccomanda esplicitamente per il caso
"localhost" è la prima**, ed è l'unica che non richiede un deploy.

**1. Inbound filter server-side "Events coming from localhost"** — è un interruttore, non codice.
[Inbound Filters](https://docs.sentry.io/concepts/data-management/filtering/) lo elenca fra i
filtri disponibili in `[Project] > Project Settings > Inbound Filters`, con la premessa:

> Sentry provides several methods to filter data in your project. **Using sentry.io to filter
> events is a simple method since you don't have to configure and deploy your SDK** to filter
> projects.

> These filters are exclusively applied at ingest time and not later in processing. […] **Filtered
> events do not consume quota.**

La guida quota lo conferma e lo colloca nel flusso:
[Manage Your Error Quota](https://docs.sentry.io/pricing/quotas/manage-event-stream-guide/) —
*"Sentry provides several methods to filter all events and attachments server-side, which are
applied **before** checking for potential rate limits"*, e nell'elenco *"Events coming from
`localhost`"* è fra i quattro *"settings that you simply toggle on or off"* (a differenza di
*Filter by Error Message* e *Filter by Release*, che la stessa pagina marca *"available only if
your organization is on a Business or Enterprise plan"*: il filtro localhost **non** porta quella
nota).

**2. `enabled`** — [Options](https://docs.sentry.io/platforms/javascript/guides/astro/configuration/options/),
default `true`, e la doc ne segnala il limite invece di raccomandarlo:

> Specifies whether this SDK should send events to Sentry. **Setting this to `enabled: false`
> doesn't prevent all overhead from Sentry instrumentation. To disable Sentry completely, depending
> on environment, call `Sentry.init` conditionally.**

Quindi la raccomandazione della doc, quando l'ambiente è noto, è **non chiamare `init`**, non
`enabled: false`.

**3. `beforeSend`** — stessa pagina:

> This function is called with an SDK-specific message or error event object, and can return a
> modified event object, or `null` to skip reporting the event. This can be used, for instance, for
> manual PII stripping before sending. By the time `beforeSend` is executed, all scope data has
> already been applied to the event.

La guida quota lo descrive come *"invoked when the SDK captures an error event, **right before
sending it** to your Sentry account"*. È un filtro **client-side**, e la doc non lo propone come
soluzione per localhost: lo propone per logica custom sui dati dell'evento.

**4. `denyUrls` / `ignoreErrors`** — citati sopra. `denyUrls` guarda l'URL del *file sorgente* nel
top stack frame, non l'URL della pagina, il che lo rende lo strumento sbagliato per "questa
sessione veniva da localhost".

### (c) Quota: evento mai inviato contro evento inviato e poi scartato

**La doc distingue i due casi, e li tratta allo stesso modo ai fini della quota.** Fonte:
[Quota Management / What Counts Towards Your Quota](https://docs.sentry.io/pricing/quotas/).
La valutazione è una pipeline ordinata, e gli inbound filter stanno *prima* dei rate limit:

> **Inbound Filters** — If an inbound filter is applied for a type of error, transaction/span,
> attachment, log, or application metric, **and your subscription allows**, it won't be counted.

> **SDK Filtering: `beforeSend` and `beforeSendTransaction`** — All Sentry SDKs support the
> `beforeSend` callback method, which you can use to modify the data of an error event or to drop
> it completely.

E la tabella riassuntiva *"What Counts Toward Your Quota - Quick Guide"* mette entrambi nella
colonna **non conta**, insieme:

| Scenario | Yes, this data counts |
| --- | --- |
| The event defies inbound filters configured in sentry.io | *(vuoto)* |
| The event is sent after the SDK sample rate has been exceeded | *(vuoto)* |
| The event isn't sent based on SDK filters | *(vuoto)* |
| The event isn't sent based on SDK configuration | *(vuoto)* |

La pagina Inbound Filters lo ripete in proprio: *"Filtered events do not consume quota"*. E la
guida quota chiarisce il complemento — *"After these checks are processed, events and attachments
that aren't dropped based on these filters count toward your quota. They're accepted into Sentry,
where they're persisted and stored."*

**Un caso che invece consuma quota**, e che va detto perché è la scorciatoia sbagliata più a
portata di mano: nascondere un environment dalla UI non lo scarta.
[Creating and Filtering Environments](https://docs.sentry.io/concepts/key-terms/environments/):

> You can hide environments from your environments dropdown by navigating to **Project Settings >
> Environments**, and selecting "Hide", but **events sent to that environment will still count
> against your quota**.

Stessa pagina, e vale per (a): *"You **cannot delete** environments, but you can hide them"*. Un
nome di environment scritto male resta lì per sempre.

**Riserva onesta sul "and your subscription allows"**: quell'inciso compare solo nella pagina
quota e non è spiegato da nessuna parte. Le uniche restrizioni di piano che ho trovato dichiarate
sono su *Filter by Release* e *Filter by Error Message* (Business/Enterprise). Per il filtro
localhost **non ho trovato una pagina che dichiari la disponibilità per piano**: la doc Sentry non
pubblica una matrice per-piano degli inbound filter.

---

## Cosa è documentato / cosa resta inferenza

### Documentato dalle fonti primarie

1. `300031` **non esiste** come voce di documentazione. Esiste `300*`, *"Generic challenge
   failure / Bot behavior detected / Retry: Yes"*, e le cifre finali sono dichiarate *"for
   internal use"*. [Error codes](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/)
2. Tutte e sette le azioni di troubleshooting per quella famiglia riguardano il **visitatore** e
   il suo ambiente. Nessuna riguarda la configurazione del sito. (stessa pagina)
3. Cloudflare **non documenta** alcuna soppressione per i `300*`. Documenta un "ignoralo pure"
   esplicito solo per il `401` in console, e non lo estende. (stessa pagina)
4. `return true` dalla `error-callback` evita *"additional error logging"*; un ritorno falsy
   produce *"a warning to the JavaScript console"*. In **assenza** di callback, *"Turnstile will
   throw a JavaScript exception"*. [Client-side errors](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/)
5. Il **perimetro** di quella soppressione non è documentato. Nessuna pagina Turnstile descrive
   l'interno di `api.js`, né lega il valore di ritorno al percorso che lancia. (stessa pagina)
6. Il retry automatico è documentato, insieme al fatto che *"the error callback can be invoked
   multiple times for the same underlying issue"*; si governa con `retry: 'never'` e
   `retry-interval`. (stessa pagina)
7. `browserApiErrors` avvolge `setTimeout`, `setInterval`, `requestAnimationFrame`,
   `XMLHttpRequest.send` (più `onload`/`onerror`/`onprogress`/`onreadystatechange`) e
   `addEventListener`/`removeEventListener` su 31 prototipi; è attiva di default; ogni API ha il
   suo flag booleano, quindi **è disattivabile selettivamente**. `_wrapTimeFunction` marca
   `mechanism.handled: false`. [codice 10.70.0](https://github.com/getsentry/sentry-javascript/blob/10.70.0/packages/browser/src/integrations/browserapierrors.ts) ·
   [doc](https://docs.sentry.io/platforms/javascript/guides/astro/configuration/integrations/browserapierrors/)
8. `environment` è un'opzione di `init`, senza pagina dedicata nella guida Astro. Il default
   documentato è contraddittorio (`production` in tabella, *"development or production depending
   on whether the application is packaged"* nel testo); il codice installato risolve con
   `DEFAULT_ENVIRONMENT = "production"`. [Options](https://docs.sentry.io/platforms/javascript/guides/astro/configuration/options/)
9. Nessuno dei pacchetti `@sentry/*` installati legge `process.env.SENTRY_ENVIRONMENT`: l'unico
   simbolo omonimo è l'attributo di span `SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT`. (verificato sul
   `node_modules` di questo repo, `@sentry/core/build/cjs/semanticAttributes.js:13`)
10. `enabled: false` **non** è la strada raccomandata: la doc dice che *"doesn't prevent all
    overhead"* e che per disattivare davvero si chiama `Sentry.init` **condizionalmente**. (stessa
    pagina)
11. Esiste un inbound filter server-side dedicato, *"Events coming from localhost"*, in
    `[Project] > Project Settings > Inbound Filters`, e Sentry lo presenta come il metodo semplice
    *"since you don't have to configure and deploy your SDK"*.
    [Inbound Filters](https://docs.sentry.io/concepts/data-management/filtering/)
12. Quota: eventi scartati da inbound filter e eventi non inviati per `beforeSend`/configurazione
    SDK **non contano**, e stanno nella stessa colonna della tabella ufficiale. Gli inbound filter
    agiscono *"at ingest time"*, *"before checking for potential rate limits"*.
    [Quotas](https://docs.sentry.io/pricing/quotas/)
13. Nascondere un environment **non** ferma il consumo: *"events sent to that environment will
    still count against your quota"*, e gli environment non si cancellano.
    [Environments](https://docs.sentry.io/concepts/key-terms/environments/)

### Inferenza mia, non documentata

- **Che il `300031` in produzione sia rumore atteso e non un guasto del sito** è una deduzione, non
  una citazione. Regge su tre fatti documentati messi in fila — la famiglia è `Retry: Yes`, il
  troubleshooting è tutto lato visitatore, e i casi di configurazione hanno codici propri e
  `Retry: No` — ma Cloudflare non lo afferma da nessuna parte. Se il volume crescesse, l'unico
  canale ufficiale è il feedback report, non un cambio di codice.
- **Che `return true` non possa fermare un throw nato dentro un `setInterval` interno di
  Turnstile** è coerente con la doc ma non è affermato dalla doc: la doc lega il valore di ritorno
  all'*"additional error logging"* e basta. La prova per me resta la misura in produzione già agli
  atti in `astro-project/src/components/Servizi.astro:579-592`, non questa ricerca.
- **Che l'eccezione arrivi a Sentry perché `browserApiErrors` avvolge `setInterval`** è una
  deduzione dallo stack più il codice dell'integrazione. Il codice dice cosa avvolge e con quale
  `mechanism`; non dice, né potrebbe, che quel frame sia di Turnstile.
- **Che `denyUrls` su `challenges.cloudflare.com` catturerebbe questi eventi** non l'ho verificato.
  La doc avverte che `denyUrls` guarda l'URL del file sorgente del top stack frame: plausibile che
  quel frame sia `api.js`, ma è un'ipotesi da misurare, non un fatto.
- **Come popolare `environment` a build time in questo scenario** (Astro statico servito da
  Workers, locale con `npx wrangler dev`) **non è documentato da Sentry**. Fuori dal perimetro di
  questa ricerca ma vale come pista: `sentry.client.config.js` è codice client bundlato da Vite,
  quindi `import.meta.env` è disponibile lì — è una garanzia di **Astro/Vite**
  ([docs.astro.build, Environment variables](https://docs.astro.build/en/guides/environment-variables/)),
  non di Sentry, e la fonte va letta prima di scrivere codice. In ogni caso l'ambiente sarebbe
  quello del **build**, non quello del runtime: un unico `dist/` costruito una volta non può
  distinguere chi lo serve. Il discriminante affidabile a runtime è `location.hostname`, e questa
  è una mia proposta, non una raccomandazione di Sentry.
- **Che l'inbound filter localhost sia disponibile sul piano free** non l'ho potuto confermare:
  la doc quota condiziona la non-contabilizzazione a *"and your subscription allows"* senza
  spiegare l'inciso, e marca esplicitamente Business/Enterprise **solo** su *Filter by Release* e
  *Filter by Error Message*. L'assenza di quella nota sul filtro localhost **suggerisce** che sia
  disponibile ovunque; non lo prova. Si verifica in un secondo aprendo Project Settings, e quella
  è una misura, non una lettura.

---

## Appendice — `?onload=` non dice quello che sembra dire (misura, 04-09-2026)

Aggiunta dopo che questa nota ha accompagnato una **regressione in produzione**, il PR #272:
merita di stare qui perché è il punto in cui la doc primaria non basta e conta solo la misura.

La doc Turnstile offre due modi per sapere quando l'API è pronta, e **nessuno dei due dice quello
che serve a chi sta per chiamare `execute()`**:

- `turnstile.ready()` è inutilizzabile su uno script iniettato a runtime, che è `async` per forza.
  Cloudflare lo rifiuta a parole: *«Remove async/defer from the Turnstile api.js script tag before
  using turnstile.ready()»*. Misurato: la promise non si risolve mai.
- `?onload=` risolve **troppo presto**. Misurato in produzione su `marcobellingeri.dev/it/`: la
  callback viene invocata, `window.turnstile.execute` esiste, ma i widget `.cf-turnstile` **non
  sono ancora resi** — nessun `input[name="cf-turnstile-response"]`, nessun `iframe` — perché
  Turnstile scarica un secondo stadio (`/turnstile/v0/g/<hash>/api.js`) e li rende dopo. Un
  `execute()` chiamato lì lancia `Please provide 2 parameters to execute: container and
  parameters`, e il form contatti resta inutilizzabile.

Contro-misura, stessa pagina, stesso momento, con `api.js` **semplice** (nessun parametro):
entrambi i widget resi in **51 ms**, ed `execute()` non lancia.

**Conclusione operativa**: il segnale di prontezza non è «l'API è caricata» ma «QUESTO widget è
reso», e l'unico modo osservabile di saperlo è la presenza dell'input nascosto che Turnstile crea
nel container. Nessuna delle due API documentate lo espone. Il *perché* (il secondo stadio) è
inferenza; il *cosa* è misura, ripetuta su due pagine e due lingue.

## Appendice — perché il difetto non è stato preso in locale

La causa non è stata la disattenzione, è stata l'**asimmetria fra locale e produzione**: la sitekey
di produzione è legata all'hostname vero, quindi su `localhost` il widget non si rende **mai**, e
un guasto reale ha esattamente lo stesso sintomo di «siamo in locale». Un ambiente che non sa
distinguere un difetto da una propria limitazione non è un ambiente di prova: lì una verifica può
solo confermare, mai smentire.

Rimedio adottato (`astro-project/src/lib/turnstile.ts`): in locale il loader sostituisce la sitekey
con quella di test di Cloudflare `1x00000000000000000000AA`, valida su qualsiasi hostname. Da lì il
percorso completo si prova sul portatile — misurato subito dopo il fix: widget resi, `POST
/api/contact` e `POST /api/ask` partiti, zero errori non gestiti, zero violazioni CSP. Il gate vero
resta comunque server-side nel Worker, che una chiave di test non supera: la sostituzione non
indebolisce niente in produzione, dove non avviene.
