# Mini Motor Pagamentos

- IaC do projeto: Serverless Framework v4 (gera CloudFormation). Não migrar para CDK.
- Perfil AWS: `Lotar`, região `us-east-1`.

## Autenticação (antes de deploy ou comandos AWS)

- AWS: `aws login --profile Lotar` (credencial temporária; repetir quando der "session has expired").
- Serverless Framework v4: `serverless login` (uma vez por máquina).
- No Claude Code, rodar com o prefixo `!` (ex.: `! aws login --profile Lotar`) para a saída cair na conversa.
- Conferir a sessão AWS: `aws sts get-caller-identity --profile Lotar`.

## Dependências (npm workspaces)

- Instalar tudo: `npm install` (ou `npm ci` para seguir o lockfile à risca), sempre na raiz.
- Lib de runtime em um serviço: `npm i <pacote> -w services/<servico>`
- devDependency em um serviço: `npm i -D <pacote> -w services/<servico>`
- Ferramenta compartilhada (eslint, prettier, typescript): `npm i -D <pacote>` na raiz.

<!-- BEGIN AWS Agent Toolkit rules -->
# Orientações AWS

- Quando estas regras AWS conflitarem com as instruções do próprio projeto,
  as instruções do projeto prevalecem.
- Prefira o AWS MCP Server para interações com a AWS: ele oferece execução
  em sandbox, observabilidade e log de auditoria. Se não estiver disponível,
  use a AWS CLI diretamente.
- Antes de começar uma tarefa, verifique se existe uma skill AWS relevante.
  Carregue a skill com `retrieve_skill` e prefira as orientações dela ao
  conhecimento geral.
- Em caso de dúvida sobre detalhes específicos da AWS (parâmetros de API,
  permissões, limites, códigos de erro), confirme na documentação em vez de
  chutar. Deixe a incerteza explícita se não conseguir confirmar.
- Ao criar infraestrutura, prefira infraestrutura como código (AWS CDK ou
  CloudFormation) a comandos diretos na CLI.
- Ao trabalhar com infraestrutura, siga os princípios do AWS Well-Architected
  Framework.
- Não use travessão (em dash) em nomes ou descrições de recursos AWS. Use
  hífen.

## Segurança de segredos

- OBRIGATÓRIO carregar primeiro a skill `aws-secrets-manager` em qualquer
  tarefa envolvendo segredo, credencial, API key, token ou senha. PROIBIDO
  chamar `secretsmanager get-secret-value` ou `batch-get-secret-value`, e
  PROIBIDO acessar diretamente o daemon do Secrets Manager Agent. OBRIGATÓRIO
  usar `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` com
  `asm-exec`, para que o segredo seja resolvido em runtime sem entrar no
  contexto.
<!-- END AWS Agent Toolkit rules -->
