# Plano do Mini Motor Pagamentos

Plano em nível de etapas. O planejamento técnico (código e recursos AWS) vem depois, etapa por etapa.

## Objetivo

Motor de recorrência que cobra assinaturas por cartão através de operadoras simuladas, sem cobrar duas vezes e sabendo o resultado final de cada cobrança. Existe para servir de sistema observado nas 4 semanas de estudo de observabilidade (2 a 29 de novembro).

## Decisões tomadas

| Decisão | Motivo |
| --- | --- |
| Cronograma mantido: Fase 1 até 25/10, Fase 2 até 01/11 | Se uma semana não fechar, a seguinte é estendida |
| Processador chama as operadoras por HTTP | Timeout, callback e tracing entre sistemas ficam realistas |
| Gerador de carga é uma Lambda | Aparece no tracing junto com o resto do fluxo |
| Operadoras são um sistema externo ao motor | A fronteira HTTP é o que torna o problema realista |
| Instrumentação (logs estruturados, métricas, tracing) fica para as semanas de estudo | O aprendizado de como tornar o sistema observável faz parte do estudo, não da montagem |
| Plano versionado em `docs/plano.md` | Evolui junto com o código |

## Fase 1: base do motor (12 a 25 de outubro)

**Pronta quando:** uma rodada do cenário normal (~1.000 cobranças) passa pelas operadoras A e B, o status fica gravado no DynamoDB e uma mensagem processada duas vezes não gera cobrança duplicada.

A ordem prioriza ter um fluxo ponta a ponta funcionando cedo, com a operadora A (a mais simples), e só depois adicionar a B, que traz os casos difíceis.

### Etapa 1.1: fundação

- **Objetivo:** repositório e conta AWS prontos para deploy seguro.
- **Entra:** estrutura do projeto Serverless Framework (Node/TypeScript), deploy e remoção de uma função de teste, orçamento com alerta de US$ 5, região definida.
- **Fica de fora:** qualquer regra de negócio.
- **Pronta quando:** `deploy` e `remove` funcionam e o alerta de orçamento está criado.

### Etapa 1.2: planos e assinaturas

- **Objetivo:** ter o que cobrar.
- **Entra:** modelo de dados no DynamoDB (planos, assinaturas, cobranças), API HTTP para cadastrar planos e assinaturas (com token fictício, como `tok_aprova`) e consultar uma assinatura com o histórico de cobranças.
- **Fica de fora:** cancelamento, troca de plano, tela.
- **Pronta quando:** dá para criar um plano e uma assinatura e consultá-la via curl/Postman.

### Etapa 1.3: operadora A

- **Objetivo:** primeira operadora simulada, rápida e previsível.
- **Entra:** endpoint HTTP que recebe a cobrança com chave de idempotência, aprova a maioria e recusa algumas com motivo (saldo insuficiente, cartão vencido, suspeita de fraude). Comportamento ajustável por cenário (taxa de recusa).
- **Fica de fora:** extrato (Fase 2).
- **Pronta quando:** chamadas diretas à operadora devolvem aprovações e recusas na proporção do cenário.

### Etapa 1.4: fila e processador

- **Objetivo:** o coração do motor: cobrar uma vez só.
- **Entra:** fila SQS, processador que envia a cobrança à operadora com a chave de idempotência e grava o resultado (pendente, aprovada, recusada, erro). Proteção contra a mesma mensagem processada duas vezes.
- **Fica de fora:** DLQ (Fase 2), retentativa de recusa (Fase 2).
- **Pronta quando:** uma cobrança enfileirada termina com status gravado, e reenviar a mesma mensagem manualmente não gera segunda cobrança.

### Etapa 1.5: gerador de carga e cenários

- **Objetivo:** produzir tráfego sob demanda.
- **Entra:** Lambda que cria assinaturas e as cobranças do ciclo em rajada, com cenário e quantidade como parâmetros. Cenários: normal e recusas altas. Planos com tempo comprimido.
- **Fica de fora:** cenário B lenta (vem na 1.6); agendador contínuo (opcional).
- **Pronta quando:** uma rodada de ~1.000 cobranças no cenário normal passa inteira pela operadora A.

### Etapa 1.6: operadora B

- **Objetivo:** introduzir o caso difícil: lentidão e timeout ambíguo.
- **Entra:** operadora lenta, que às vezes dá timeout e, em parte desses timeouts, já tinha cobrado. Cenário B lenta no gerador. Distribuição das cobranças entre A e B.
- **Pronta quando:** o cenário B lenta gera timeouts e o motor não duplica cobranças.

### Etapa 1.7: rodada de aceitação

- **Objetivo:** validar o critério de pronto da Fase 1.
- **Entra:** rodar os três cenários (normal, B lenta, recusas altas), conferir os status no DynamoDB e forçar uma mensagem duplicada.
- **Pronta quando:** o critério de pronto da Fase 1 é atendido.

### Distribuição sugerida

- Sábado 17/10: etapas 1.1 a 1.3
- Sábado 24/10: etapas 1.4 a 1.7

## Fase 2: os casos difíceis (26 de outubro a 1 de novembro)

**Pronta quando:** uma cobrança recusada é retentada e a assinatura é suspensa após 3 falhas, o callback da operadora C atualiza a cobrança certa uma vez só, mensagens que falham demais chegam à DLQ e (se feita) a conciliação aponta uma diferença provocada.

| Etapa | Entra | Depende de |
| --- | --- | --- |
| 2.1 DLQ | Fila de erros ligada à fila de cobranças, com limite de tentativas | 1.4 |
| 2.2 Retentativa de recusa | Nova tentativa após alguns "dias" comprimidos, até 3 vezes; depois suspende a assinatura | 1.4, 1.5 |
| 2.3 Operadora C e receptor de callback | Operadora responde "pendente" e confirma depois por callback (atrasado, repetido ou ausente); endpoint que liga o aviso à cobrança e ignora repetições | 1.3, 1.4 |
| 2.4 Cenários da Fase 2 | C sem callback e misto aleatório (o gerador sorteia o problema e grava qual foi) | 1.5, 2.3 |
| 2.5 Conciliação (opcional) | Rotina que compara o registro do motor com o extrato das operadoras | ver pendência P4 |

### O que a Fase 1 precisa deixar pronto para a Fase 2

- **Status extensível:** a Fase 2 adiciona estados (aguardando callback, suspensa). O modelo da Fase 1 não deve assumir que são só quatro.
- **Operadoras configuráveis por cenário:** a C e o misto aleatório reaproveitam o mesmo mecanismo de cenário da A e da B.
- **Chave de idempotência estável por cobrança:** o callback da C e a conciliação dependem dela para achar a cobrança original.
- **Registro do cenário da rodada:** o misto aleatório precisa gravar qual problema foi sorteado.

## Pendências

| # | Questão | Decidir quando |
| --- | --- | --- |
| P1 | Como o motor resolve o timeout ambíguo da operadora B (consulta de status pela chave ou "erro" até a conciliação) | Etapa 1.6 |
| P2 | Quem grava a cobrança como `pendente`: o gerador antes de enfileirar ou o processador | Planejamento técnico da etapa 1.4 |
| P3 | Fila padrão ou FIFO (o diagrama diz "ordem", mas cobranças de assinaturas diferentes não precisam de ordem) | Planejamento técnico da etapa 1.4 |
| P4 | Conciliação: o quanto agrega ao estudo de observabilidade, e se entra na Fase 2 | Antes da Fase 2 |
| P5 | Onde as operadoras guardam o próprio estado (chaves já vistas, cobranças feitas) | Etapa 1.3 |
| P6 | DynamoDB provisionado (gratuito, mas sujeito a throttling na rajada) ou on-demand (centavos neste volume) | Planejamento técnico da etapa 1.2 |
| P7 | ~~Retenção dos logs: 7 ou 14 dias~~ Resolvida: 14 dias (ver `tecnico/1.1-fundacao.md`) | Etapa 1.1 |

## Pontos de atenção

- **Cronograma apertado:** a Fase 1 inteira em dois sábados. Se apertar, a etapa 1.6 (operadora B) é a primeira a escorregar para a semana 0b.
- **Timeouts encadeados:** com a operadora B lenta, o timeout da chamada HTTP precisa ser menor que o da Lambda, que precisa ser bem menor que o visibility timeout da fila; senão a mesma mensagem é reprocessada enquanto a primeira ainda roda.
- **Depuração sem instrumentação:** como logs estruturados ficam para a semana 1, a depuração da Fase 1 será com logs simples. É esperado, e a semana 1 vai mostrar a diferença na prática.
