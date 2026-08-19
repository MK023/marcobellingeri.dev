---
lang: it
title: "Una CSP a hash non ha spazio per un syntax highlighter"
date: 2026-08-28
description: "La mia Content Security Policy ammette gli script per hash esatto e nient'altro. Funziona benissimo finché un plugin di Markdown non decide di colorarti il codice con stili inline, e lì scopri quanto costa davvero la policy."
tags: [security, astro, webdev, css]
edicola: "Una CSP che hasha i suoi stili"
---

La Content Security Policy di questo sito ammette gli script per hash SHA-256. Niente `unsafe-inline`, niente nonce, nessun jolly. Una lista di digest esatti, e qualunque cosa i cui byte non corrispondano a uno di quelli non gira.

È la versione forte della policy, ed è forte per una ragione banale: un hash è un'affermazione sul contenuto che nessuno può falsificare. Se un'injection atterra nel mio HTML, non importa che stia dentro un tag `<script>` sulla mia stessa origine. Il suo hash non è in lista, quindi è inerte.

Il prezzo di tutto questo si è presentato la prima volta che ho messo un blocco di codice dentro un articolo.

## Cosa un hash può coprire e cosa no

Astro calcola questi hash durante la build e li scrive in un `<meta http-equiv>`. Conosce i byte di ogni script che impacchetta, quindi può digerirli ed emettere una policy che li rispecchia.

Il limite sta tutto in quella frase. Hasha quello che impacchetta. Qualunque cosa produca markup a render time, dopo che la policy è già stata scritta, per lui non esiste.

C'è esattamente uno script su questo sito che Astro non impacchetta, e l'eccezione se la merita. Lo snippet anti-FOUC che legge il tema salvato deve girare prima del primo paint, quindi è `is:inline` e Astro lo lascia stare. Il suo hash si mantiene a mano:

```js
scriptDirective: {
  resources: ["'self'", 'https://challenges.cloudflare.com'],
  hashes: ['sha256-WV81hIAeXjEdgj/cFIXtOf53g8pIquCjmXQuCHOehlw='],
},
```

Il che va benissimo per uno script che cambia due volte l'anno. Smette di andare bene come strategia generale nel momento in cui qualcosa comincia a generare markup su ogni pagina.

## Shiki è stata la prima vittima

Astro porta Shiki per il syntax highlighting del Markdown e lo accende di default. È fatto davvero bene. Colora anche il codice avvolgendo ogni token in uno `<span>` con un attributo `style` inline.

Sotto `style-src 'self'` senza `unsafe-inline`, ognuno di quegli attributi viene bloccato. I blocchi di codice escono come testo grigio indifferenziato.

La riparazione ovvia è ammetterli, e il modo per ammettere specificamente un attributo `style=` è `'unsafe-hashes'`. Su quella keyword ho letto la specifica due volte, perché il nome sta facendo un lavoro molto onesto. Permette contenuto hashato in posizione di attributo, e la posizione di attributo è dove atterra una fetta considerevole delle injection vere. Aggiungerlo per far sembrare carino il codice avrebbe significato indebolire esattamente la proprietà per cui la policy esiste, in nome di una feature che non mi aveva chiesto nessuno.

Quindi l'ho spento:

```js
markdown: {
  syntaxHighlight: false,
},
```

I blocchi di codice ora emettono `<pre><code>` puri, contro cui la policy non ha niente da obiettare. Il colore vive in un foglio di stile, agganciato a classi, servito da `'self'`, e nessun hash entra in gioco perché non è inline niente.

Voglio essere preciso su cosa ho rinunciato, perché "e vabbè, disattivalo" è un finale sospettosamente comodo. Ho perso il colore semantico per token. Quello che ho è un monospace con un contrasto sensato, e ho deciso che un blocco di codice leggibile conta più di una keyword viola. Se un pezzo avesse davvero bisogno dell'highlighting, la strada è una trasformazione a build time che emette classi invece di stili, non una policy più larga.

## La regola che ne è uscita

La parte interessante non era il flag di configurazione. Era accorgersi che Shiki non è un caso particolare, è il primo caso di una classe, e la classe è "qualunque cosa scriva stile dentro un attributo".

Il mio codice lo fa in continuazione, se glielo lascio fare. Un margine da sistemare in un componente è più veloce da scrivere come `style="margin-left:8px"` che come classe più regola nel foglio di stile. Passa anche la build, sembra corretto in `astro preview`, e muore in silenzio in produzione, perché la preview la policy vera non te la serve.

Quindi ha smesso di essere ammesso, e il divieto sta scritto dove nasce la tentazione:

```css
/* Qui e non come style= inline: un attributo style richiederebbe 'unsafe-hashes' nella CSP. */
#copy-email-btn{ margin-left:8px; }
```

Otto pixel di margine, con un commento che spiega perché vivono in un foglio di stile. Sembra documentazione di troppo finché non ti immagini la versione di me che ha fretta, vede una regola nuda da otto pixel senza spiegazioni, e decide che verrebbe più pulita inline.

## Il test gira sul costruito, non sul sorgente

Niente di tutto questo sopravvive per disciplina. Sopravvive perché un test legge l'HTML costruito e fallisce su qualunque cosa trovi.

Per ogni pagina in `dist/` estrae gli script inline, ne calcola l'hash e verifica che il digest compaia nella policy. Quando fallisce ti passa la correzione:

```
Script inline senza hash nella CSP.
Aggiungi 'sha256-…' a security.csp.scriptDirective.hashes in astro.config.mjs.
```

Poi due asserzioni per la classe che Shiki mi ha presentato. Nessun attributo `style=`, da nessuna parte. Nessun handler inline `on…=`, da nessuna parte. Tutt'e due nominano la stessa ragione nel messaggio di fallimento, cioè che ammetterli richiederebbe `'unsafe-hashes'`, così chi ci sbatte impara la policy invece di imparare solo che la CI è arrabbiata.

Una quarta presidia un guasto diverso. La mia policy vera vive nel meta, e una CSP negli header verrebbe applicata come intersezione con quella, quindi un banale `script-src 'self'` scritto lì annullerebbe ogni hash e manderebbe il sito offline. Quel test ammette esattamente una direttiva nel file degli header, `frame-ancestors`, che dentro un meta è ignorata per specifica e quindi lì deve stare.

Altri due esistono solo per tenere onesta la suite. Uno verifica che la build abbia prodotto delle pagine. L'altro verifica che da qualche parte in `dist/` almeno uno script inline sia stato trovato, perché il giorno in cui la mia regex smette di matchare, tutte le asserzioni per pagina cominciano a passare su una lista vuota e l'intero file diventa verde controllando niente. Un test che non può fallire non è un test, e il modo più economico per beccarne uno è verificare che il suo input non sia vuoto.

C'è una trappola in questo disegno che vale la pena nominare. I test leggono `dist/`, quindi lanciarli senza ricostruire vuol dire dare un voto all'output di ieri. Per quello lo script è:

```json
"test": "npm run build && npm run test:csp"
```

Quella suite l'ho vista passare su una build vecchia. È rassicurantissima e non vuol dire assolutamente niente.

## Cosa vale la pena controllare sul tuo

Se hai una CSP, carica il sito e apri la console invece di rileggerti la policy. Le risorse bloccate si annunciano lì, e una policy che sta rompendo in silenzio un widget su una pagina, letta dal file di configurazione, è identica a una che funziona.

Se oggi sei su `unsafe-inline`, la domanda utile non è come arrivare a una policy a hash in una mossa. È quale dipendenza si romperebbe per prima se lo facessi. Nel mio caso è stato l'highlighter che il mio stesso framework accende di default, e prima che succedesse non l'avrei indovinato.

E se una policy stretta ce l'hai già, vai a cercare dov'è l'eccezione. Di solito ce n'è una, di solito ha una buona ragione, e di solito la buona ragione ha due anni.
