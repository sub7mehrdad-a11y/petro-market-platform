# Turkey sodium bicarbonate producer map - sources and data-quality log

Prepared 2026-10-17. All plant facts below were read in fetched pages/documents (WebFetch). Capacities are only numbers actually read; nothing filled from memory.

## 1. Plants (F) - claim -> source

### Eti Soda (Beypazari, Ankara) - id `eti_soda`
| Claim | Source |
|---|---|
| Makes soda ash AND sodium bicarbonate; trona by solution extraction, monohydrate process; plant address Yesilagac Mah. Gurağac Kumeevler No:47/A, 06730 Beypazari/Ankara; 2021 output "1.95 million tonnes of natural soda ash and sodium bicarbonate" (combined) | https://cinergroup.com.tr/en/glass-and-chemicals/eti-soda ; https://www.etisoda.com/en/home-page |
| Bicarbonate grades listed: food, feed, technical (spec sheets PS.03.ST.11 technical, PS.03.ST.14 feed) | https://www.etisoda.com/en/home-page ; https://www.etisoda.com/wp-content/uploads/2023/10/PS.03.ST_.11-TEKNIK-TUR-SODYUM-BIKARBONAT.pdf ; https://etisoda.com/wp-content/uploads/2025/02/PS.03.ST_.14-YEM-TURU-SODYUM-BIKARBONAT-SARTNAMESI.pdf |
| **Bicarbonate capacity 200 kt/y** (EPD: "Eti Soda produces over 1.65 million tonnes of Soda Ash and 200,000 tonnes of sodium bicarbonate every year"; EPD data year 2018, published 2017-11-27, revised 2020-08-07, valid to 2025-08-06) | https://api.environdec.com/api/v1/EPDLibrary/Files/f296cc91-eec7-47b1-8b02-57e4a8903d52/Data |
| **Bicarbonate capacity 2 lines x 0.1 Mt/y = 200 kt/y**; nameplate (soda ash) 1.7 Mt/y; 2020 bicarbonate production Eti 0.2 Mt (2019: 0.2); 2020 daily output 553 t/day | WE Soda Ltd Annual Report 31 Dec 2020, pp. 2 and 4: https://wesoda.com/media/1d8ea692/annual-accounts-2020.pdf |
| Main export terminal Derince Port, "327 km from the production facilities", road transport modelled; no rail mentioned in EPD | EPD (above) |
| Ownership Ciner Holding 74% / Eti Maden 26% (state) | https://en.wikipedia.org/wiki/Eti_Soda ; https://www.forbes.com.tr/ekonomi/soda-kulu-sessiz-bir-hammadde-dosyasindan-stratejik-devlet-meselesine |
| Product "sent to storage silos awaiting rail and distribution by truck"; ~90% exported (2013 article) | https://www.bus-ex.com/sites/default/files/2019-09/ETISoda-Euro.Mining-Mar13-Bro-s.pdf |
| Beypazari town 40.17028 N, 31.92111 E | https://en.wikipedia.org/wiki/Beypazar%C4%B1 |
| Trona field ~20 km NW of Beypazari (villages Cakiloba, Zaviye, Basoren) | https://api.maden.org.tr/uploads/portal/resimler/ekler/347c51419ffb23c_ek.pdf |
| **Plant coordinates 40.26 N, 31.76 E = ESTIMATE (grade C)**, no fetched source gave plant coordinates; basis = address + field description above | see section 3 |

### Kazan Soda Elektrik (Sincan/Kazan, Ankara) - id `kazan_soda`
| Claim | Source |
|---|---|
| Produces soda ash and sodium bicarbonate from trona (solution mining); address Mulk Mah., Incirlik Kume Evleri, Kazan Soda No:145/1, Sincan, Ankara | https://www.kazansoda.com/?p=6838 ; https://www.kazansoda.com/?p=8063 |
| Bicarbonate grades: technical (PS.03.ST.51), food/"besin" (PS.03.ST.89), feed/"yem" (PS.03.ST.88; min 99.3% NaHCO3; packs 25 kg PE bags, 1 t / 1.25 t bigbags, bulk) | https://www.kazansoda.com/wp-content/uploads/2026/06/PS.03.ST_.88-Yem-Sinifi-Sodyum-Bikarbonat-Urun-Ozellikleri-Rev.05-19.06.2026.pdf ; https://www.kazansoda.com/wp-content/uploads/2026/06/PS.03.ST_.89-Besin-Sinifi-Sodyum-Bikarbonat-Urun-Ozellikleri-Rev.06-19.06.2026.pdf ; https://www.kazansoda.com/wp-content/uploads/2026/06/PS.03.ST_.51-Teknik-Tur-Sodyum-Bikarbonat-Urun-Ozellikleri-Rev.06-19.06.2026.pdf |
| **Bicarbonate capacity 2 lines x 0.1 Mt/y = 200 kt/y**; soda ash 2.7 Mt/y nameplate on 5 lines; 2020 bicarbonate production Kazan 0.2 Mt (2019: 0.1); 2020 daily output 500 t/day | WE Soda 2020 accounts, pp. 2 and 4 (above) |
| EBRD: sodium bicarbonate 0.2 Mt/y, soda ash 3.0 Mt/y (current); expansion adds 6th soda ash line and raises bicarbonate lines from two to three (US$286m project); plant ~35 km NW of Ankara centre, ~15 km NW of Sincan centre, nearest settlement Incirlik ~800 m east | https://www.ebrd.com/content/dam/ebrd_dxp/documents/project/56049/PSD%2056049%20(Turkish).pdf |
| Wikipedia: 2.5 Mt soda ash and 200 kt baking soda; plant inaugurated 2018-01-15 | https://en.wikipedia.org/wiki/Kazan_Soda_Elektrik |
| WE Soda: Kazan >3 Mt/y soda ash + bicarbonate combined; planned Unit 6 to ~4 Mt incl. pharma-grade bicarbonate and bicarbonate for flue-gas desulphurisation (FGD); no start date | https://www.wesoda.com/our-operations/growth-projects ; https://www.wesoda.com/our-operations/manufacturing |
| Plant coordinates 40.10894 N, 32.50615 E ("yaklasik konum", Climate TRACE data on Industry Atlas) - consistent with the EBRD description | https://inzonex.co.uk/industryatlas/tr/plant/kazan-soda-elektrik-üretim.html |
| Sincan 39.95944 N, 32.57667 E | https://en.wikipedia.org/wiki/Sincan,_Ankara |

### Producers checked and NOT included
- **Sisecam (Mersin soda ash plant, Kazanli, Akdeniz district)**: soda ash only in every fetched document (Mersin capacity 1.5 Mt/y, +175 kt heavy soda ash approved Jan 2024, https://www.bloomberght.com/sisecam-dan-kapasite-artisi-karari-2345645 ; Wikipedia https://en.wikipedia.org/wiki/Soda_Industry_Inc. lists no bicarbonate). Sisecam's website lists sodium bicarbonate under "soda ash products" (https://www.sisecam.com/en/soda-ash-products) and its 2025 annual report footnotes that a soda ash ranking "includes sodium bicarbonate capacity", but no document names a plant, location or tonnage for bicarbonate, and its facilities page lists only Wyoming sites as "Chemicals" (https://www.sisecam.com/en/sisecam-in-the-world?tab=1%40our-facilities&subcategories=5%40Chemicals). Excluded as unverified - this is a data gap, not proof of no production.
- No other Turkish bicarbonate producer was found. A search for "Turkey sodium bicarbonate manufacturers" returned only Eti Soda and Kazan Soda.

## 2. Destinations (D)
- Ports (Derince, Ambarli, Mersin, Iskenderun, Izmir/Alsancak, Aliaga, Samsun, Trabzon) and the ten consumption centres: well-known public coordinates rounded to 2 decimals; NOT individually fetched/verified (error up to a few km). Derince chosen because the Eti EPD names it as the main export terminal; other ports are generic candidates, not confirmed shipping routes of either plant.
- Land borders (coordinates read from Wikipedia): Gurbulak 39.41639 N 44.35250 E (village; https://en.wikipedia.org/wiki/G%C3%BCrbulak) ; Kapikule 41.707944 N 26.391972 E (https://en.wikipedia.org/wiki/Kap%C4%B1kule) ; Ipsala town 40.92167 N 26.38194 E (town, gate not given; https://en.wikipedia.org/wiki/%C4%B0psala) ; Habur/Ibrahim Khalil 37.1447222 N 42.56556 E (https://en.wikipedia.org/wiki/Ibrahim_Khalil_border_crossing) ; Sarp: Sarpi village 41.52139 N 41.55194 E (https://en.wikipedia.org/wiki/Sarpi,_Georgia) ; Dilucu: Umut Bridge 39.65528 N 44.80333 E (https://en.wikipedia.org/wiki/Umut_Bridge) ; Esendere village 37.715 N 44.602 E (gate itself is some km away; https://en.wikipedia.org/wiki/Esendere,_Y%C3%BCksekova). List of crossings: https://en.wikipedia.org/wiki/Land_border_crossings_of_Turkey
- Syrian crossings (Cilvegozu, Nusaybin etc.) deliberately omitted (conflict zone / restricted status). Kapikoy (Van, Iran) not included.
- Suggested Nusaybin/Cilvegozu (Syria) dropped as above; the matrix is complete for the 25 destinations used.

## 3. Distances
- Source: public OSRM server, `/table/v1/driving/...?sources=0&annotations=distance`, 2-decimal coordinates, 3 calls per plant (9+9+7 destinations); values copied exactly and rounded to integer metres. 17 route geometries from `/route/v1/driving/...?overview=simplified&geometries=geojson` (Eti: Derince, Ambarli, Mersin, Gurbulak, Istanbul, Ankara, Kapikule, Izmir; Kazan: Derince, Ambarli, Mersin, Gurbulak, Istanbul, Ankara, Habur, Samsun, Iskenderun). Route distances equal the table values to the metre.
- Four route-geometry fetches (Eti-Gurbulak, Eti-Kapikule, Eti-Izmir, Kazan-Istanbul) were first refused or summarised by the fetch tool's quote limit and re-fetched with a different prompt. Content identical in form; validator confirms length/endpoints.
- OSRM snaps the Eti start point 1.7 km from the input coordinate (to 31.761311, 40.244648); Kazan 0.15 km.
- Validator result: `F 2 D 25 roads 17 problems 0`, all roads OK (len/table 0.916-0.992, ends < 2 km), no SUSPECT flags.

## 4. Data-quality problems and inconsistencies
1. **Eti bicarbonate capacity conflict**: 100 kt/y (bus-ex 2013 brochure; Wikipedia) vs 200 kt/y (EPD 2018 data; WE Soda 2020 accounts: 2 lines x 0.1 Mt). The 100 kt figure is evidently from before a second line was added. 200 kt used (grade A).
2. **Soda ash capacity conflicts** (not used on the map): Eti 1.0 Mt (2013), 1.1 Mt (Forbes TR), 1.65 Mt (EPD), 1.7 Mt (WE Soda accounts), "about 2 Mt soda ash + bicarbonate combined" (WE Soda site), 1.95 Mt 2021 output (combined); Kazan 2.5 Mt (Wikipedia), 2.7 Mt (accounts/Glass Intl), 2.9 Mt 2021 output, 3.0 Mt (EBRD), ">3 Mt" (WE Soda), 3.1 Mt (Climate TRACE). Forbes TR's totals for Turkey (~5 Mt) do not reconcile with its own plant figures.
3. **Group totals vs plant figures**: WE Soda accounts give 2020 production "0.2 Mt" per plant and 1,053 t/day total; 1,053 x 365 = 384 kt/y, i.e. ~96% utilisation (derived by us, not published).
4. **EPD distance to Derince**: EPD says 327 km; OSRM gives 253 km from our estimated Eti location (and 331 km from Kazan, which matches 327 km much better). Either the EPD distance refers to another loading point/route, or it was copied from the Kazan site, or our Eti coordinate is far off (it cannot be off by 75 km if near Beypazari). Unresolved.
5. **Eti coordinates unverified** (grade C); Wikipedia pages for Eti Soda/Kazan Soda give no coordinates; Nominatim/Overpass/Photon/Wikidata fetches were blocked by the tool.
6. **Location naming**: Kazan plant is in Sincan district (address, EBRD, Wikipedia) while WE Soda documents say "Kazan District of Ankara" (Kahramankazan, where the trona mine is). Cinergroup says "Yenikent, Sincan". Used the postal address.
7. **Date inconsistency** on cinergroup.com.tr Kazan news page: header 21.07.2016 vs text "opened 15 January 2018".
8. **Stale/dated sources**: EPD data year 2018; WE Soda accounts FY2020; Kazan spec sheets Rev.05/06 dated June 2026 (current). No 2024-2025 bicarbonate production figure was found. Kazan third bicarbonate line status (built or not) unknown.
9. **Concentration**: both verified plants belong to Ciner Group/WE Soda (Eti is 26% state-owned via Eti Maden). The map therefore shows one competitor group.
10. **Sisecam bicarbonate** claimed on the company website but unlocated (see above).
11. **Port use not confirmed for Kazan**; only Eti's EPD names Derince. Borders in the Iran direction: operational status in 2026 not checked.
12. Iranian/Turkish trade statistics (HS 283630 imports/exports) were not part of this task and are not shown.
