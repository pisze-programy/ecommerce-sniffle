# ENTITY-DATA.md

Harvested entity data for the tracked shops.
This file keeps the state so nothing is lost.
Harvest date: 2026-08-30.

## What is done

Migrations `0011_shops.sql` to `0020_persons.sql` add:

- firms with KRS and social profiles
- persons (owners) with their social links
- owner relations (person to firm)
  Config sets `entityId` for the tracked shops.
  The shop page graph shows firms and their owners.

## Shop entities

Legend:
`DONE` - in D1 and config (migration 0011)
`BASE` - in D1 from the pilot (migration 0009)
`PART` - partial, missing firm name or KRS
`GAP` - no firm data collected yet

| Shop                 | Firm                                         | KRS                                 | Facebook                    | Instagram                                                  | Status |
| -------------------- | -------------------------------------------- | ----------------------------------- | --------------------------- | ---------------------------------------------------------- | ------ |
| hdrey                | Hdrey Group Sp. z o.o.                       | 0000683399                          | hdreypl                     | hdrey_pl                                                   | BASE   |
| divesmed             | Dives Med Poland Sp. z o.o.                  | 0000820197                          | divesmedpolska              | divesmed_pl                                                | DONE   |
| forcer               | Forcer Sp. z o.o.                            | 0001134950                          | 61569223094545              | forcerofficial                                             | BASE   |
| infini               | INFINI Premium Filler (brand)                | -                                   | -                           | -                                                          | BASE   |
| nago                 | CLTHS S.A.                                   | 0000735885                          | nago.clth                   | nago_com                                                   | DONE   |
| mushi                | Mushi Sp. z o.o.                             | 0001123342                          | mushipl                     | mushi_pl                                                   | DONE   |
| gymglamour           | Gym Glamour Sp. z o.o.                       | 0001049978                          | gymglamour                  | gym_glamour                                                | DONE   |
| wakenbake            | Wakenbake Sp. z o.o.                         | 0000962607                          | wakenbakepl                 | wakenbake_pl                                               | DONE   |
| theodderside         | The Odder Side sp. z o.o.                    | 0000983656                          | odderside                   | the_odderside                                              | DONE   |
| islandrecords        | DDD sp. z o.o. (brand Modelki On Top)        | 0000074457                          | modelkiontop                | modelkiontop                                               | DONE   |
| icedstuff            | ICED STUFF Sp. z o.o.                        | 0001131880                          | icedstuffofficial           | icedstuff                                                  | DONE   |
| emereedivine         | Emeree Divine Sp. z o.o.                     | 0001198145                          | emereedivine                | emereedivine                                               | DONE   |
| laboratoriumpanidomu | Laboratorium Pani Domu Sp. z o.o.            | 0000645460                          | LaboratoriumPaniDomu        | laboratorium.pani.domu (+YT @laboratoriumpanidomu)         | DONE   |
| 33mata               | 33mata (Michał Matczak / Mata)               | 0001042259                          | 33pomiot.liryczny           | 33mata                                                     | DONE   |
| papitoenergy         | Papito Vibe Jarząbkowski                     | 0001173436                          | papito.energy               | papito.energy                                              | DONE   |
| risky                | Risky sp. z o.o.                             | 0001111425                          | -                           | risky_store_overthelimit                                   | DONE   |
| sanah                | Sanah (brand, owner same)                    | 0000067517                          | sanahmusic                  | sanahmusic (+YT, TikTok @sanah)                            | DONE   |
| wojanshop            | Wojan Group sp. z o.o.                       | 0000933831                          | wojanyt                     | wojanteam_pl (+TikTok @wojanteam_pl, YT @WojanGames)       | DONE   |
| rever                | JDG Anytry (NIP 8691956359, REGON 363561958) | -                                   | rever.kids.woman            | rever.com.pl (+TikTok @rever.com.pl, YT @revercompl)       | DONE   |
| royalwatch           | Royal Watch sp. z o.o.                       | 0001225829                          | royalwatch.luksusowezegarki | royalwatch.pl                                              | DONE   |
| booso                | DwaKa Agnieszka Kalita (JDG)                 | - (NIP 9482470759, REGON 146867817) | boosobooso                  | booso.pl                                                   | DONE   |
| mualasklep           | Muala sp. z o.o.                             | -                                   | -                           | muala_sklep (+TikTok/YT @ksiazulo)                         | DONE   |
| sklepskolim          | Skolim sp. z o.o.                            | 0000701824                          | -                           | sklepskolim.pl                                             | DONE   |
| wkdzik               | WK Sp. z o.o.                                | 0000646549                          | wkdzikpl                    | wkdzik (+YT @wkdzikpl, TikTok @wkdzik.pl)                  | DONE   |
| brokies              | Brookes sp. z o.o.                           | 0000624657                          | -                           | brokies.wrld (+YT @brokies2727)                            | DONE   |
| premieresociety      | Premiere sp. z o.o.                          | 0000160814                          | premieresociety             | premieresociety                                            | DONE   |
| dobrerzeczy          | Fundacja dobrerzeczy                         | 0000535327                          | dobrerzeczytm               | dobrerzeczy                                                | DONE   |
| marionis             | -                                            | -                                   | -                           | marionis.pl (+TikTok @marionis.pl)                         | GAP    |
| e-daag               | Ledrin Sp. z o.o. (brand DAAG)               | 0000085721                          | -                           | -                                                          | DONE   |
| friendzstore         | Friendzstore Sp. z o.o.                      | 0001185078                          | -                           | -                                                          | DONE   |
| berecords            | Baila Ella Records sp. z o.o. (disabled)     | 0001003456                          | -                           | -                                                          | DONE   |
| fagata               | Agata Fąk (JDG, brand 1:1, disabled)         | - (NIP 5252864292)                  | 100081290535607             | fagataaa                                                   | DONE   |
| godsavequeens        | GSQ Sp. z o.o.                               | 0000658570                          | GodSaveQueensCom            | godsavequeens_official                                     | DONE   |
| icon-amsterdam       | IWON GLOBAL LLC (foreign)                    | -                                   | iconamsterdam.official      | icon                                                       | DONE   |
| derichgallery        | Derich Gallery (foreign, USA)                | -                                   | 61573287702730              | derichgallery (+YT @DerichGallery)                         | DONE   |
| monartofficial       | Mon Art Official (foreign, Belgium)          | -                                   | www.monartofficial          | mon.art.official                                           | DONE   |
| beaumont             | Stone Fashion Group (foreign, Amsterdam)     | -                                   | BeaumontAmsterdam           | beaumont_amsterdam (+TikTok @beaumont_amsterdam, LinkedIn) | DONE   |

## Persons (in D1, migration 0020)

| Person                               | Role       | IG                   | FB                 | YouTube                 | LinkedIn |
| ------------------------------------ | ---------- | -------------------- | ------------------ | ----------------------- | -------- |
| Rafał Afanasjef                      | Właściciel | -                    | -                  | -                       | yes      |
| Karolina Pisarek                     | Właściciel | karolina_pisarek     | 100044181591844    | -                       | -        |
| Mikołaj (Konopskyy)                  | Właściciel | konopskyy_           | -                  | @Konopskyy              | -        |
| Daniel Walendziak                    | Właściciel | -                    | -                  | -                       | -        |
| Krzysztof Sawicki                    | Właściciel | -                    | -                  | -                       | -        |
| Weronika Broś                        | Właściciel | weronikabros         | -                  | -                       | yes      |
| Wojciech Maciej Gola                 | Właściciel | -                    | -                  | -                       | -        |
| Sofiia Sivokha                       | Właściciel | sofisivokha          | -                  | -                       | -        |
| isamupt                              | Właściciel | isamupt              | IsAmUxPompa69      | -                       | -        |
| d3tailer                             | Właściciel | d3tailer             | detailer.official  | -                       | -        |
| pompa.team                           | Właściciel | pompa.team           | pompateamofficial  | -                       | -        |
| Karolina Preiss                      | Właściciel | karolina_preiss      | -                  | -                       | -        |
| DwaKa Agnieszka Kalita               | Firma      | agakalitaa           | agnieszka.kalita.1 | -                       | -        |
| Tomasz Klata                         | Właściciel | tomekklata           | -                  | -                       | -        |
| Skolim                               | Właściciel | skolim__             | SKOLIMoficjalnie   | -                       | -        |
| Samuel Onuha                         | Właściciel | realonuha            | -                  | @SamuelOnuha            | -        |
| Ruben Onuha                          | Właściciel | ruub                 | -                  | @RubenOnuha             | -        |
| Kubanczyk                            | Właściciel | kubanczyk.official   | KubanczykProdukcja | -                       | -        |
| Oskar Lipiński                       | Właściciel | oscarlipinsky        | -                  | @oskarlipinski          | -        |
| Orzechowski Robert                   | Właściciel | robercik_dynamit     | -                  | -                       | -        |
| Sikora Paweł                         | Właściciel | ponczek_endomorfik   | -                  | -                       | -        |
| Owczarzak Michał                     | Właściciel | owcawk               | -                  | -                       | -        |
| Sakowski Michał                      | Właściciel | sakerwk              | -                  | -                       | -        |
| discokarol_                          | Właściciel | discokarol_          | -                  | -                       | -        |
| dajczmanhubert                       | Właściciel | dajczmanhubert       | -                  | -                       | -        |
| pirlo444_                            | Właściciel | pirlo444_            | -                  | -                       | -        |
| bedoes2115                           | Ambasador  | bedoes2115           | -                  | -                       | -        |
| Sabina Hajdo-Piórek                  | Właściciel | -                    | -                  | -                       | -        |
| Paweł Piórek                         | Właściciel | -                    | -                  | -                       | -        |
| Sebastian Czajewski                  | Właściciel | czvjnik              | 102286502728984    | @czvjnik                | -        |
| ksiazulo                             | Firma      | ksiazulo             | -                  | @ksiazulo               | -        |
| Pasha Biceps (Jarosław Jarząbkowski) | Właściciel | pashabiceps          | G5.pasha           | -                       | -        |
| Michał Matczak                       | Właściciel | 33mata               | -                  | -                       | -        |
| Agata Fąk                            | Firma      | fagataaa             | 100081290535607    | -                       | -        |
| wojan_official                       | Właściciel | wojan_official       | -                  | -                       | -        |
| Ula Kowalska                         | Właściciel | ulakowalska_official | -                  | -                       | -        |
| Zuza Fijak                           | Właściciel | suziontop            | -                  | -                       | -        |
| Agnieszka Nowakowska                 | Właściciel | agaanowakowska       | -                  | -                       | -        |
| Julia Turewicz                       | Właściciel | juliajanulewicz      | -                  | -                       | -        |
| Justyna Przygońska                   | Właściciel | justyna_przygonska   | -                  | -                       | -        |
| Brygida Handzelewicz-Wacławek        | Właściciel | brygidamagdalena     | -                  | -                       | -        |
| Marek Zimniak                        | Właściciel | royalwatch.pl        | -                  | -                       | -        |
| Kamil Galant                         | Właściciel | kmileko              | -                  | -                       | -        |
| Marcin Galant                        | Właściciel | martinfriendlyscott  | -                  | martinfknscott (TikTok) | -        |
| Zuzanna Irena Grabowska              | Firma      | sanahmusic           | -                  | -                       | -        |
| Karol Słuszniak                      | Właściciel | swooshniak           | -                  | -                       | -        |

Loose connection: Sofiia Sivokha bio says @gym_glamour ambasador.
Karolina Pisarek is an ambassador for royalwatch.
INFINI: the shop is infinifiller.pl. No KRS, no social links.
It is a loose brand and stays an empty node.

## Open gaps

1. KRS and firm name for marionis.
2. Profiles for berecords (shop disabled, no profiles found).
3. Firms without an owner: derichgallery, monartofficial,
   berecords, dobrerzeczy (fundacja, board to confirm).
4. Person profiles for Daniel Walendziak, Krzysztof Sawicki,
   Wojciech Maciej Gola, Sabina Hajdo-Piórek, Paweł Piórek.
5. Confirm risky owners isamupt and d3tailer.
