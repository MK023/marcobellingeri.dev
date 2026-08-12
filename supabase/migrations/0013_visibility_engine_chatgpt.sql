-- 0013: ChatGPT diventa la terza fonte del monitor discoverability.
--
-- Perche' QUI e non nel `detail`, come le tre viste di GSC: quelle sono modi di
-- guardare la stessa fonte (Google), questa e' una fonte diversa — un altro
-- indice, un'altra risposta, un altro trend da confrontare nel tempo. Il
-- `detail` non regge un confronto storico per fonte: `engine` si'.
--
-- Il valore e' `chatgpt` e non `openai`: chi legge la serie fra un anno cerca il
-- prodotto che ha interrogato, non il fornitore dell'API. La riserva — che si
-- misura l'API con ricerca web e NON chatgpt.com — vive nel referto, dove il
-- dato viene letto, non solo in un commento di migration.
--
-- L'ordine e' drop-then-add e non un secondo CHECK: due vincoli sulla stessa
-- colonna si sommano in AND, e il vecchio continuerebbe a rifiutare 'chatgpt'
-- lasciando l'insert rotto con la migration "applicata". Le righe esistenti
-- (solo perplexity|gsc) restano valide, quindi l'ADD non fallisce.

alter table visibility_observations
  drop constraint if exists visibility_observations_engine_check;

alter table visibility_observations
  add constraint visibility_observations_engine_check
  check (engine in ('perplexity', 'chatgpt', 'gsc'));
