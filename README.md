# Magellan

Magellan est un coffre custodial mutualisé pour Binance-Peg BSC-USD. **Cette version est irrévocablement limitée à BNB Smart Chain Mainnet (chain ID 56)** et ne doit pas être déployée avec des fonds avant revue indépendante et tests.

Le script fixe le token à `0x55d398326f99059fF775485246999027B3197955`. Le RPC BNB Mainnet a répondu pour cette adresse avec le nom `Tether USD`, le symbole `USDT` et 18 décimales. Ces métadonnées ne prouvent pas que Tether en est l'émetteur ni la qualité des réserves du peg. Tether ne liste actuellement pas d'USD₮ BNB sur sa page officielle; ce coffre traite cet actif comme un peg tiers.

## Règles du coffre

- Le coffre détient un solde global; il n'y a pas de parts individuelles ni de fonction de réclamation.
- Seul le propriétaire peut déposer via `deposit`, verrouiller ou retirer.
- Le propriétaire initial est configuré au déploiement (`OWNER_ADDRESS`); utilise de préférence un Safe multisignature dont tu contrôles les signataires.
- Le verrouillage commence uniquement sur appel explicite de `lock(duration)`.
- Les dépôts du propriétaire sont permis pendant le verrouillage mais ne changent pas son échéance.
- Aucun retrait n'est permis avant l'échéance.
- Seul le solde réel du token est affiché; la comptabilité refuse les tokens dont le transfert ne correspond pas exactement au montant demandé.
- Le propriétaire peut retirer tout ou partie des tokens après l'échéance.
- Le transfert de propriété utilise le mécanisme en deux étapes d'OpenZeppelin.

Un transfert ERC-20 direct à l'adresse du contrat peut toujours être fait par un tiers. Il n'existe pas de fonction de récupération administrative. N'interagis qu'avec le token prévu et une adresse de contrat confirmée.

## Interface en ligne

L'interface est un site statique : les transactions sont signées dans le wallet du propriétaire, pas sur un serveur. Le site publié est accessible publiquement; seuls les appels autorisés par le contrat peuvent toutefois modifier le coffre.

Le workflow `.github/workflows/pages.yml` publie automatiquement le contenu de `app/` sur GitHub Pages à chaque push sur `main`.

1. Crée un dépôt GitHub et pousse le projet sur la branche `main`. Vérifie que `.env` et toute clé privée restent hors du dépôt; le `.gitignore` exclut `.env`.
2. Dans le dépôt GitHub, ouvre **Settings → Pages** et choisis **GitHub Actions** comme source de publication.
3. Le workflow publiera le site. Son adresse sera généralement `https://<utilisateur>.github.io/<nom-du-depot>/`.
4. Après déploiement du contrat, ajoute `app/deployment.json` au dépôt et pousse-le sur `main`. Ce fichier contient des informations publiques (adresses, bloc et hash du bytecode), jamais de clé privée. Sans lui, l'interface reste en mode non configuré et les actions sont désactivées.

Si le contrat est déployé avec Remix, relève l'adresse du contrat créé et le numéro de bloc de sa transaction de création, puis lance en local :

```bash
npm run configure:frontend -- 0xAdresseDuContrat NumeroDuBloc
```

Cette commande interroge BNB Mainnet en lecture seule, vérifie le réseau, le code, l'adresse du token et ses métadonnées, puis génère `app/deployment.json`. Elle ne déploie pas le contrat et ne nécessite aucune clé privée. Vérifie les valeurs générées avant de les publier.

Pour tester l'interface localement avant ou après publication :

Après déploiement, `app/deployment.json` est généré avec le réseau, l'adresse de Magellan, le token et le bloc de déploiement. L'interface affiche le solde du wallet propriétaire, le solde du coffre et les événements de dépôt, retrait et verrouillage associés au compte.

```bash
npm start
```

Ouvre `http://localhost:8000`, connecte le wallet propriétaire sur BNB Mainnet et vérifie l'adresse de contrat affichée. L'interface permet l'approbation puis le dépôt, le choix d'une durée en secondes/minutes/heures/jours, le verrouillage et le retrait après échéance.

## Configuration et tests

```bash
npm install
npm run check
```

Hardhat exécute les tests sur une chaîne locale simulant le chain ID 56 pour tester le garde réseau du contrat. Cela ne déploie rien sur la blockchain.

## Déploiement (mainnet uniquement)

Le constructeur du contrat rejette toute chaîne autre que chain ID 56. La configuration Hardhat et le script de déploiement ne déclarent eux aussi que BNB Mainnet.

1. Vérifie séparément l'adresse, l'émetteur et le mécanisme de peg de l'actif via une source officielle de l'émetteur et l'explorateur. La page officielle [Tether – Supported Protocols](https://tether.to/en/supported-protocols/) ne publie actuellement pas d'USD₮ pour BNB Smart Chain.
2. Obtiens une revue de sécurité indépendante du code et du contrat final, et considère l'utilisation d'un propriétaire multisignature.
3. Crée `.env` localement à partir de `.env.example`. Utilise un wallet de déploiement dédié, une clé protégée et un RPC fiable. `OWNER_ADDRESS` doit être l'adresse du wallet owner prévu, idéalement un Safe multisignature. Ne mets et ne partage jamais de clé privée dans le dépôt.
4. Après avoir accepté les risques spécifiques de Binance-Peg BSC-USD, lance :

```bash
npm run deploy:mainnet
```

Le script n'accepte que le chain ID 56, le réseau Hardhat `bscMainnet`, l'adresse de token fixée ci-dessus et les métadonnées attendues. **Cela ne prouve pas l'identité de l'émetteur ni le maintien du peg.** Le déploiement dépense du BNB et est irréversible; le script ne transfère ni n'approuve des tokens.

Ne lance pas le déploiement tant que l'adresse correcte n'est pas confirmée. Aucun déploiement réel n'a été effectué.

## Limites et risques

- Coffre custodial : aucun déposant autre que le propriétaire ne peut appeler les fonctions de dépôt/retrait, mais des tokens envoyés directement au contrat ne sont pas attribués à leur expéditeur.
- La sécurité des fonds dépend de la sécurité de la clé du propriétaire et du token choisi.
- Le contrat n'a pas fait l'objet d'un audit professionnel indépendant; les tests automatisés ne remplacent pas un audit.
- La durée maximale du verrou est de cinq ans.
