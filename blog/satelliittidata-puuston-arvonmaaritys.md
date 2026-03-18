---
title: "Miten satelliittidata muuttaa puuston arvonmäärityksen"
date: "2026-03-18"
description: "Sentinel-2-satelliittikuvat ja NDVI-analyysi mullistavat puuston arvonmäärityksen. Jatkuva seuranta korvaa kalliit maastoinventoinnit."
keywords: "puuston arvo, metsän arvo, NDVI, Sentinel-2, metsän biomassa, satelliitti metsäanalyysi, kantohinta, metsätilan arvonmääritys"
author: "ForestData-tiimi"
---

# Miten satelliittidata muuttaa puuston arvonmäärityksen

Puuston arvonmääritys on vuosisatojen ajan perustunut maastotyöhön: metsäammattilaiset kulkevat koealoja, mittaavat puiden rinnankorkeusläpimittaa (DBH), arvioivat latvuspeittävyyttä ja ekstrapoloivat puuston tilavuuden koealojen perusteella. Menetelmä toimii, mutta se on kallis, hidas ja tuottaa tilannekuvan, joka vanhenee yhden kasvukauden aikana.

Satelliittikaukokartoitus muuttaa tämän. ESA:n Sentinel-2-satelliitit tuottavat ilmaista, korkearesoluutioista multispektrikuvaa viiden päivän välein, ja metsänomistajilla on nyt pääsy jatkuvaan, koko metsätilan kattavaan dataan. Näin tämä teknologia muokkaa puuston arvonmääritystä.

## Perinteisen arvonmäärityksen rajoitteet

Perinteinen metsäinventointi Suomessa maksaa noin 15–40 euroa hehtaarilta maastosta ja puuston rakenteesta riippuen. 250 hehtaarin metsätilalla se tarkoittaa 4 000–10 000 euroa ennen analyysin aloittamista. Prosessi sisältää tyypillisesti:

- **Maastotyöryhmät**, jotka mittaavat koealoja (ympyräkoealat, säde 9–12 m)
- **Puulajien tunnistamisen** sekä läpimitta- ja pituusmittaukset jokaisesta koealan rungosta
- **Ekstrapoloinnin** koealoista koko metsikköön tilastollisten mallien avulla
- **Tilavuustaulukot**, joilla läpimitta ja pituus muunnetaan käyttökelpoisiksi kuutiometreiksi

Tuloksena on hetkellinen arvio. Kun raportti on kirjoitettu, puut ovat kasvaneet, sääilmiöt ovat saattaneet aiheuttaa tuhoja ja markkinahinnat ovat muuttuneet. Inventoinnin toistaminen 2–3 vuoden välein tarkoittaa jatkuvaa kulua ilman reaaliaikaista kokonaiskuvaa.

## Sentinel-2 ja NDVI

Sentinel-2-satelliitit kuvaavat 13 spektrikanavalla jopa 10 metrin spatiaalisella resoluutiolla. Metsätaloudessa tärkein johdettu indeksi on **NDVI (Normalized Difference Vegetation Index)**, joka lasketaan punaisen ja lähi-infrapunakanavan avulla:

**NDVI = (NIR - punainen) / (NIR + punainen)**

Terve, fotosynteettisesti aktiivinen kasvillisuus heijastaa voimakkaasti lähi-infrapunaa ja absorboi punaista valoa. Tiheissä boreaalisissa metsissä NDVI-arvot ovat tyypillisesti 0,6–0,9. Tämä yksinkertainen suhdeluku korreloi erinomaisesti keskeisten metsäparametrien kanssa:

- **Lehtialaindeksi (LAI)** — latvuspeittävyyden mittari
- **Maanpäällinen biomassa (AGB)** — runkojen, oksien ja lehdistön kokonaiskuivapaino
- **Nettoperustuotanto (NPP)** — nopeus, jolla metsä sitoo hiiltä

Kalibroimalla NDVI:n maastomittausdataa vasten — kuten Suomen valtakunnan metsien inventointi (VMI) — voidaan rakentaa regressiomalleja, jotka arvioivat biomassan hehtaarikohtaisesti pelkästään satelliittipikselien perusteella.

## Biomassasta puuston arvoon

Biomassa-arvion muuntaminen rahalliseksi arvoksi vaatii useita lisätietokerroksia:

### 1. Puulajikoostumus

Eri puulajeilla on eri puuaineen tiheys, kasvunopeus ja markkina-arvo. Suomen boreaalisissa metsissä tärkeimmät kaupalliset puulajit ovat mänty (*Pinus sylvestris*), kuusi (*Picea abies*) ja koivu (*Betula pendula* ja *B. pubescens*). Spektraalisten tunnusten ja lisätietojen, kuten maaperäkarttojen, avulla kokonaisbiomassa voidaan jakaa puulajikohtaisiksi tilavuuksiksi.

### 2. Kantohinnat

Luonnonvarakeskus (Luke) julkaisee viikoittain kantohinnat alueittain, puulajeittain ja puutavaralajeittain (tukkipuu, kuitupuu, energiapuu). Alkuvuonna 2026 tyypilliset hinnat ovat:

| Puutavaralaji | Mänty | Kuusi | Koivu |
|---------------|-------|-------|-------|
| Tukkipuu | 72 €/m³ | 78 €/m³ | 52 €/m³ |
| Kuitupuu | 22 €/m³ | 24 €/m³ | 19 €/m³ |

Yhdistämällä satelliittiperusteisen tilavuusarvion ajankohtaisiin markkinahintoihin voidaan tuottaa puuston arvonmäärityksiä, jotka päivittyvät yhtä usein kuin satelliitti kuvaa — pilvettömissä olosuhteissa viiden päivän välein.

### 3. Kasvumallinnus ja optimaalinen hakkuuajankohta

Ehkä tehokkain sovellus on **eteenpäin katsova arvonmääritys**. Sovittamalla kasvukäyrät 10 vuoden NDVI-aikasarjaan voidaan ennustaa, milloin metsikkö saavuttaa taloudellisen kypsyyden — pisteen, jossa hakkuun nettonykyarvo (NPV) ylittää kasvun jatkamisen arvon. Optimaalinen hakkuuvuosi riippuu:

- Nykyisestä kasvunopeudesta (johdettu NDVI-trendistä)
- Puulajikohtaisista tuotostaulukoista
- Diskonttokorosta (pääoman vaihtoehtoiskustannus)
- Odotetuista puun hintakehityksistä

ForestDatan analyysi näyttää optimaalisen hakkuuikkunan suoraan biomassan kasvukaaviossa, antaen metsänomistajalle selkeän, datapohjaisen signaalin hakkuun ajoittamiseen.

## NDVI:n tuolla puolen: moni-indeksianalyysi

Vaikka NDVI on tärkein indeksi, moderni satelliittimetsätalous käyttää lisäindeksejä arvioiden tarkentamiseen:

- **NDMI (Normalized Difference Moisture Index)** havaitsee vesistressin ja hyönteistuhot ennen kuin ne näkyvät paljaalle silmälle
- **NDRE (Normalized Difference Red Edge)** on herkempi klorofyllipitoisuuden vaihteluille tiheissä latvustoissa, joissa NDVI saturoituu
- **Latvuskorkeusmallit** LiDAR- tai fotogrammetriasta täydentävät spektridataa rakenteellisella tiedolla

Yhdistämällä nämä indeksit koneoppimismalleihin, jotka on koulutettu valtakunnan metsien inventointidatalla, biomassa-arvion tarkkuus voi yltää 15–20 prosenttiin maastomittauksista — riittävä metsänhoidon päätöksentekoon ja taloussuunnitteluun.

## Tarkkuus ja rajoitukset

Satelliittipohjainen arvonmääritys ei korvaa kaikkia maastomittauksia. On tärkeää ymmärtää rajoitukset:

- **Pilvisyys** voi vähentää käyttökelpoisten havaintojen määrää, erityisesti pohjoismaisina talvina
- **Spatiaalinen resoluutio** (10 m) tarkoittaa, ettei yksittäisiä puita eroteta; arviot koskevat metsikkötason keskiarvoja
- **Allometriset mallit** on kalibroitu tietyille metsätyypeille eivätkä välttämättä sovellu vieraille puulajeille tai epätavallisille metsikkörakenteille
- **Aluskasvillisuus** vaikuttaa NDVI-signaaliin mutta ei ainespuun tilavuuteen

Viranomaistarkoituksiin (kuten EU:n puutavara-asetuksen noudattaminen) tai arvokkaissa kaupoissa satelliittidata tulisi täydentää — ei korvata — kohdennettuja maastotarkistuksia. Jatkuvaan seurantaan, hoitosuunnitteluun ja alustavaan arvonmääritykseen satelliittipohjaiset menetelmät tarjoavat kuitenkin ylivoimaisen yhdistelmän kattavuutta, toistuvuutta ja kustannustehokkuutta.

## Mitä tämä tarkoittaa metsänomistajalle

Satelliittidatan demokratisoituminen tarkoittaa, ettei metsän arvonmääritys ole enää pelkästään suurten metsäyhtiöiden asia. Yksityinen metsänomistaja Keski-Suomessa voi nyt:

1. **Piirtää metsätilansa rajat** interaktiiviselle kartalle
2. **Saada biomassa- ja hiiliarviot** minuuteissa
3. **Seurata kasvutrendejä** vuosikymmenen historiadatan avulla
4. **Nähdä optimaalisen hakkuuajankohdan** nykyisten kasvunopeuksien ja markkinahintojen perusteella
5. **Tuottaa vaatimustenmukaisuusdokumentaation** EUDR-huolellisuusvelvoitetta varten

Kaikki tämä ilman maastokäyntiä ja murto-osalla perinteisen inventoinnin kustannuksista.

## Kokeile itse

ForestDatan ilmainen demo antaa sinun tutustua satelliittipohjaiseen metsäanalytiikkaan suomalaisen mäntymetsän esimerkkidatalla. Näe aidot Sentinel-2-pohjaiset NDVI-trendit, biomassa-arviot, puuston arvonmääritykset ja hiililaskelmat — suoraan selaimestasi.

[Kokeile ilmaista demoa](/app) | [Katso hinnoittelu](/#pricing)
