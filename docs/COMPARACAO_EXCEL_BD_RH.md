# Conciliação do Excel com a base local de RH

**Data da verificação:** 03/11/2026  
**Ficheiro analisado:** `Datos_de_RH员工数据库_20261029210852只保存15天.xlsx`  
**Base:** MySQL local, porta 3307

## Resumo executivo

| Indicador | Resultado |
|---|---:|
| Registos de funcionários lidos do Excel | 933 |
| Funcionários encontrados por código exato | 884 |
| Registos sem código exato na base | 49 |
| Sem código exato, BI aponta para um único registo da base | 46 |
| Sem código exato, BI aponta para vários registos da base | 2 |
| Sem código exato e sem correspondência na base | 1 |
| Campos pessoais comparados divergentes nos 884 casos por código | 0 |
| Contratos comparados divergentes nos 884 casos por código | 0 |
| Links de documentos no Excel / documentos registados na base | 3.058 / 3.058 |

**Conclusão:** os 884 funcionários com código coincidente têm os campos pessoais comparados e os dados de contrato alinhados. Os outros 49 registos precisam de revisão antes de serem considerados conciliados. Encontrar um BI igual não confirma, por si só, que seja a mesma pessoa.

## Registos sem correspondência por código

| Nome no Excel | Código no Excel | Resultado da pesquisa na base |
|---|---|---|
| BRUNO BRANDÃO DOMINGOS | S.RH2026001035 | Sem correspondência |
| Afonso Henrique Júnior | S.RH2025000888 | BI encontrado em um registo; validar identidade e código |
| TELMO CRISTÓVÃO | S.RH2025000877 | BI encontrado em um registo; validar identidade e código |
| WALTER GRAÇA SEBBASTIÃO CAETANO | S.RH2025000875 | BI encontrado em um registo; validar identidade e código |
| CLEMENTINA MBALA MAYI II | S.RH2025000864 | BI encontrado em um registo; validar identidade e código |
| DILCIA FERNANDES | S.RH2025000844 | BI associado a 2 registos na base; revisão manual |
| ISABEL SEBASTIÃO KANGA | S.RH2025000840 | BI associado a 2 registos na base; revisão manual |
| ROSSANA PEDRO NGOMBO | S.RH2025000805 | BI encontrado em um registo; validar identidade e código |
| GIZELA A. LUBAMBA | S.RH2025000799 | BI encontrado em um registo; validar identidade e código |
| BALDUINA MARIA Q. MUCANO | S.RH2025000798 | BI encontrado em um registo; validar identidade e código |
| VALDEMIRO VENACIO AFONSO | S.RH2025000797 | BI encontrado em um registo; validar identidade e código |
| LADISLAU FLORINDO KALONJI | S.RH2025000796 | BI encontrado em um registo; validar identidade e código |
| EFRAMI JEREMIAS CHISSINGA | S.RH2025000795 | BI encontrado em um registo; validar identidade e código |
| MANUEL DIAS JOÃO | S.RH2025000768 | BI encontrado em um registo; validar identidade e código |
| FRANCISCO NKHENENE FERNANDO NAMBALO | S.RH2025000702 | BI encontrado em um registo; validar identidade e código |
| JOSE AGUIAR AUGUSTO | S.RH2025000701 | BI encontrado em um registo; validar identidade e código |
| ISAIAS JOAQUIM LICOVICA | S.RH2025000700 | BI encontrado em um registo; validar identidade e código |
| FRANCISCO NKHENE FERNANDO NAMBALO | S.RH2025000695 | BI encontrado em um registo; validar identidade e código |
| FILOMENA CAMBUNDILE | S.RH2025000694 | BI encontrado em um registo; validar identidade e código |
| NELSON INACIO DOS SANTOS MANUEL JUNIOR | S.RH2025000677 | BI encontrado em um registo; validar identidade e código |
| HELENA VALERIA AGOSTINHO CUSTÓDIO | S.RH2025000672 | BI encontrado em um registo; validar identidade e código |
| TELMA DA ROSA FLORÊNCIO | S.RH2025000671 | BI encontrado em um registo; validar identidade e código |
| ROZNHA BRILHANTE MAKITU | S.RH2025000670 | BI encontrado em um registo; validar identidade e código |
| DAMIAO PINTO | S.RH2025000667 | BI encontrado em um registo; validar identidade e código |
| ADELAIDE CHIVINGA | S.RH2025000661 | BI encontrado em um registo; validar identidade e código |
| CHEN KUAIAN | S.RH2025000657 | BI encontrado em um registo; validar identidade e código |
| FÉLIX CATOMBELA | S.RH2025000647 | BI encontrado em um registo; validar identidade e código |
| RAFAEL AZEVEDO PACHECO QUIBACO | S.RH2025000625 | BI encontrado em um registo; validar identidade e código |
| ELIEZER MANUEL BARTOLOMEU CATRAIO | S.RH2025000610 | BI encontrado em um registo; validar identidade e código |
| MANUEL DIAS JOÃO | 0489SGRH2024 | BI encontrado em um registo; validar identidade e código |
| ANDRE MIGUEL VILOMBO | 0177SGRH2024 | BI encontrado em um registo; validar identidade e código |
| ANTUNES VALERIANO ABEL | 0176SGRH2024 | BI encontrado em um registo; validar identidade e código |
| DINIS LAFILA SACAMBELA | 0174SGRH2024 | BI encontrado em um registo; validar identidade e código |
| AMERICO NUNES DACHALA | 0171SGRH2024 | BI encontrado em um registo; validar identidade e código |
| ALEXANDRE JORGE CANHANGA | 0170SGRH2024 | BI encontrado em um registo; validar identidade e código |
| ANTONIO MIQUEL MUTINDI CHILEPA | 0168SGRH2024 | BI encontrado em um registo; validar identidade e código |
| ROGERIO CAPICA CAPILA | 0166SGRH2024 | BI encontrado em um registo; validar identidade e código |
| FRANCISCO CAMOÇO CHIHONGO VENTURA | 0165SGRH2024 | BI encontrado em um registo; validar identidade e código |
| JOAQUIM KAHOMBO MATEUS | 0164SGRH2024 | BI encontrado em um registo; validar identidade e código |
| CHAMBANGA FERNANDO SEKULO MUTIMBULA | 0158SGRH2024 | BI encontrado em um registo; validar identidade e código |
| NGOVIRSSO ULUNGA | 0070SGRH2024 | BI encontrado em um registo; validar identidade e código |
| MARQUES PANZO | 0067SGRH2024 | BI encontrado em um registo; validar identidade e código |
| MANUEL HAICOMBRO | 0062SGRH2024 | BI encontrado em um registo; validar identidade e código |
| LUIS SEGUNDA | 0060SGRH2024 | BI encontrado em um registo; validar identidade e código |
| JOSE MAURICIO | 0057SGRH2024 | BI encontrado em um registo; validar identidade e código |
| JORGE DACHALA | 0054SGRH2024 | BI encontrado em um registo; validar identidade e código |
| FRANCISCO CHILEPA | 0053SGRH2024 | BI encontrado em um registo; validar identidade e código |
| FILOMENA DOMINGOS | 0046SGRH2024 | BI encontrado em um registo; validar identidade e código |
| ANTONIO NAMBALO | 0044SGRH2024 | BI encontrado em um registo; validar identidade e código |

## Observações para validação

- Entre os 46 registos cujo BI aponta para um único funcionário da base, há correspondências repetidas: 23 linhas do Excel convergem em três funcionários existentes. Os grupos contêm 19, 2 e 2 linhas, respetivamente; não devem ser tratados automaticamente como a mesma pessoa.
- Os dois casos de BI associado a vários registos e o caso sem correspondência precisam de decisão da equipa de RH.
- A contagem de 3.058 documentos confirma apenas que os totais coincidem. Não comprova que cada link do Excel esteja associado ao funcionário correto ou que o conteúdo do ficheiro seja idêntico.
- A verificação foi somente de leitura; nenhum dado foi alterado.
