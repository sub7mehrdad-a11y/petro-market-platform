# China sodium bicarbonate map: sources and data-quality log

Date compiled: 2026-10-17. Files: data.json, meta.json (this folder). Validator: `python3 /home/claude/maps/validate.py /home/claude/maps/china`.

## 1. Plant claims -> source

| Plant id | Claim | Source |
|---|---|---|
| tamusu | Inner Mongolia Berun/Boyuan Chemical (formerly Yuanxing Energy, SZSE 000683) makes baking soda from trona; stated capacity 1.5 Mt baking soda, brand "Malan" (food additive, green food label); HQ Ordos | https://szse.io/companies/000683-inner-mongolia-berun-chemical-co-ltd |
| tamusu | Tamusu project design: 7.8 Mt soda ash + 0.8 Mt NaHCO3 per year; location "Tamusu mining area, Alxa Right Banner"; nearest rail "Tala Har station", avg rail freight 370 CNY/t; mining area 42.10 km2 | https://disc.static.szse.cn/disc/disk03/finalpage/2022-02-28/165cb316-5659-41ef-bf06-d4f09d4f0d69.PDF |
| tamusu | Phase I 0.4 Mt NaHCO3 at full capacity; Phase II 0.4 Mt (construction from Dec 2023, due Dec 2025); planned 1.2 Mt carbon-recovery NaHCO3 project (Boyuan Yinggen Chemical, west of Tamusu Bulag Sumu), filing obtained, 20-month build | https://static.cninfo.com.cn/finalpage/2025-04-25/1223283096.PDF ; https://static.cninfo.com.cn/finalpage/2023-12-29/1218748386.PDF |
| tamusu | H1 2026: in-operation NaHCO3 capacity 1.5 Mt/yr; Phase II 0.4 Mt and 1.2 Mt carbon-recovery unit started trial operation and produced product; H1 2026 NaHCO3 output 801.3 kt (company-wide, unaudited); NaHCO3 revenue CNY 703 m (-7.8%) | https://static.cninfo.com.cn/finalpage/2026-07-31/1225448640.PDF ; https://m.gelonghui.com/news/5279629 |
| tamusu | Company produced >50% of China's exported baking soda (company profile, 2017) | https://www.chinaservicesinfo.com/s/201712/08/WS5b784737498e855160e8cfd5/inner-mongolia-yuanxing-energy-co-ltd.html |
| tamusu | Coordinate: GeoNames "Tamsag Bulag" -> Har Borog 40.8225N 103.67E (sumu level) | https://www.geonames.org/search.html?q=Tamsag+Bulag&country=CN |
| tongbai | Tongbai County (Nanyang): trona mining, derivatives; subsidiary Zhongyuan Chemical in Tongbai | https://www.chinaservicesinfo.com/s/201712/08/WS5b784737498e855160e8cfd5/inner-mongolia-yuanxing-energy-co-ltd.html ; https://www.chinabaogao.com/jingzheng/202412/736982.html |
| tongbai | "World's largest baking soda factory" in Tongbai County, 400,000 t/yr, completed 15 March 2019 (operator not named in the article) | https://chinaservicesinfo.com/s/201903/22/WS5c944101498e079e6801bb6e/nanyang-to-build-worlds-largest-baking-soda-factory.html |
| tongbai | Coordinate 32 deg22'48"N 113 deg25'41"E | https://en.wikipedia.org/wiki/Tongbai_County |
| jinshan | Henan Jinshan Holding, Wuyang County, Luohe; NaHCO3 200,000 t/yr (affiliated Jinshan Chemical Group); listing may be outdated | https://www.cnpp.cn/pinpai/4091619.html ; https://www.cnpp.cn/china/2026/list_9696.html |
| jinshan | Henan Jindadi Chemical named as #2 NaHCO3 producer (~12% share, 2022) | https://www.chyxx.com/industry/1151902.html |
| jinshan | Coordinate 33.424123N 113.620271E (Jindadi Lianjian ammonia plant, Luohe, "exact") | https://www.gem.wiki/Henan_Jindadi_Lianjian_Ammonia_Plant |
| shuanghuan | Business scope lists soda ash, baking soda (NaHCO3), caustic soda, ammonium chloride; registered address Dongmafang, Yingcheng, Hubei | https://q.stock.sohu.com/cn/000707/index.shtml ; https://www.cnpp.cn/china/2026/list_9696.html |
| shuanghuan | Coordinate 30.921494N 113.703392E (company ammonia plant, GEM, "exact"; labelled Xiaogan) | https://www.gem.wiki/Hubei_Shuanghuan_Science_%26_Technology_Ammonia_Plant |
| lyg_alkali | Lianyungang Alkali Industry Co., Changan Rd 1, Yanweigang, Guanyun, Lianyungang; makes sodium bicarbonate among products; total 1.2 Mt/yr (page) or 1.1 Mt (2026 list) | https://www.cnpp.cn/pinpai/1637464.html ; https://www.cnpp.cn/pinpai/4091623.html ; https://www.cnpp.cn/china/2026/list_9696.html |
| lyg_alkali | Coordinate 34.4667N 119.7667E (Yanweigang town) | https://www.geonames.org/search.html?q=Yanweigang&country=CN |
| lyg_alkali | Yanwei deepwater port in Guanyun County | https://en.wikipedia.org/wiki/Guanyun_County |
| haihua | Shandong Haihua: products include sodium bicarbonate; Binhai Economic Development Zone, Weifang, south shore of Laizhou Bay | https://szse.io/companies/000822-shandong-haihua-co-ltd |
| haihua | Coordinate is approximate (see issues) | zone is "north end of Weifang": https://zh.wikipedia.org/wiki/潍坊滨海经济技术开发区 |
| tianjin_bohai | Tianjin Bohai Chemical Group listed with sodium bicarbonate (food use) | https://www.ulprospector.com/zh-cn/asia/Food/Suppliers/15892/Products/13917 ; Bohua Yongli named a producer in https://www.chyxx.com/research/202101/923775.html |
| tianjin_bohai | Solvay / Tianjin Soda Ash Plant JV at Bin Hai: 800 kt soda ash; Solvay markets 30 kt/yr bicarbonate (June 2011) | https://www.foodingredientsfirst.com/news/solvay-and-tianjin-soda-ash-plant-set-up-joint-soda-ash-plant-in-china.html ; https://www.chemistryviews.org/?p=29889 |
| tianjin_bohai | Coordinate 38.9974N 117.6745E (Tanggu) | https://en.wikipedia.org/wiki/Tanggu_District |
| hengyang | Hunan Hailian Sanyi Xiaosuda, 103 Xianfeng Rd, Hengyang; 100,000 t NaHCO3 + 50,000 t soda/yr (formerly Hengyang Hailian Brine Chemical) | https://www.cnpp.cn/pinpai/148685.html |
| hengyang | CPHI profile "Hunan HLSY Sodium Bicarbonate": 150,000 t NaHCO3, 100,000 t NH4Cl, 60,000 t NaCl; same address | https://www.cphi-online.com/company/hunan-hlsy-sodium-bicarbonate-co-ltd/ |
| hengyang | Coordinate 26.894N 112.572E (Hengyang government) | https://en.wikipedia.org/wiki/Hengyang |
| national | 2022: capacity 3.55 Mt, output 2.84 Mt, demand 2.398 Mt, exports 573 kt / USD 196 m (+53.1%), imports 130.6 kt / USD 52 m; export shares Korea 34.52%, Indonesia 11.51%, Thailand 7.02%; Central China >90% (North/Central/Northwest together) and Central ~50% of capacity; shares Yuanxing 31%, Jindadi 12%, Haitian 7% | https://www.chyxx.com/industry/1151902.html |
| national | 2021: capacity 3.015 Mt, output 2.38 Mt, exports 500-600 kt | https://www.chinabaogao.com/market/202211/617035.html |
| national | 2023: market CNY 3.604 bn, output 2.679 Mt, demand 2.127 Mt; producer name list (Yuanxing, Jinshan, Qingdao Alkali, Haihua, Haitian, Weifang Haizhiyuan, Lianyungang Alkali, Bohua Yongli, Hengyang Aijie, Hunan Hailian Sanyi, Jindadi) | https://www.chyxx.com/research/202101/923775.html |
| Yuanxing 2021 | Output 1.0457 Mt, utilisation 95.07%, avg price 1,924 CNY/t (H2 2021) | https://www.chyxx.com/industry/1119742.html |

Destination coordinates: well-known public port/border/city coordinates (not individually fetched); each was snapped by OSRM to a road within the validator tolerance (route ends < 15 km).

## 2. Distances

OSRM public server (router.project-osrm.org), driving profile, `table` for 8 x 28 matrix (24 calls of 9-10 destinations) and `route` (geojson, simplified; Tianjin plant to port with full overview) for 17 key routes. All 17 routes pass the validator (length/table 0.94-1.00; ends < 1 km). No NoRoute failures occurred; all 224 pairs are present.

Validator flag kept: `SUSPECT haihua -> dalian` ratio 3.64 (1,093,847 m vs 300 km great circle). Justified: Weifang and Dalian face each other across the Bohai Strait; OSRM has no ferry, and the road runs round Bohai Bay via Tianjin, Qinhuangdao and Jinzhou.

## 3. Data-quality problems and inconsistencies

1. Boyuan/Yuanxing in-operation capacity: 1.1 Mt/yr (2022-2024 sources) vs 1.5 Mt/yr (H1 2026); the 2026 report does not reconcile this with the newly started 0.4 Mt and 1.2 Mt units, and gives no split between Tamusu and Tongbai. The company changed its Chinese name from Yuanxing Energy to Boyuan Chemical (name seen in the 2026 report and SZSE profile; the date of change not found).
2. The Tongbai "400,000 t" 2019 article does not name the operator; attributing it to Zhongyuan Chemical (Yuanxing subsidiary in Tongbai) is an inference.
3. The 2026 H1 report gives output 801.3 kt for the company in six months; with 1.5 Mt capacity this implies near-full utilisation, but new units are in trial operation, so figures need checking against audited accounts.
4. Hengyang: 100 kt (CNPP) vs 150 kt (CPHI). The CPHI page also lists "ammonium bicarbonate" products, which may be a mis-keyed listing.
5. Lianyungang Alkali: total capacity 1.2 Mt (CNPP brand page) vs 1.1 Mt (CNPP 2026 list); bicarbonate share unknown. CNPP pages are user-compiled and may be outdated.
6. Jinshan: 200 kt comes from a CNPP brand page attributed to the group, not a site. Relationship between Jinshan and Jindadi (both in Luohe/Wuyang area) was not confirmed in fetched documents. GEM places the "Henan Jinshan Ammonia Plant" at 34.775N 113.720E labelled "Jiaozuo", which is not in Jiaozuo (looks like the Zhengzhou area); not used.
7. GeoNames lists Yanweigang under Yancheng; it belongs to Guanyun County, Lianyungang (company registered address confirms).
8. Haihua coordinate is approximate (no source with coordinates found). Tamusu coordinate is sumu-level; the true plant may be tens of km away.
9. Tianjin: the Solvay 30 kt figure is a 2011 marketing volume, not capacity; the identification of the Solvay-Tianjin JV with Bohai/Bohua Yongli is inferred.
10. chyxx national capacity and production are an institute's estimates and differ by year/source (3.55 Mt 2022 vs 3.015 Mt 2021); chyxx's 2023 page also says 2022 Jan-Aug trade volumes in a confusing order (import/export) - not used. Different chyxx pages give Central China share as 50% and 51.3%.
11. Derived (not source) number: 2022 average export unit value ~ USD 342/t (196 m / 573 kt). This is well above the USD 180/t seen in Iranian customs data and the USD 230-270 FOB range; China's export mix includes different grades, so it is only a rough benchmark.
12. Jinbei Chemical (Shandong, "Changhong" brand) says it has bases in "Shandong, Sichuan and Nigeria" and 400 kt total capacity, but no fetched page gives a factory address (Linyi is only the office); not mapped. Trader pages on chemicalbook (Jinan Shiji Tongda, Hubei Haijia, Zhengzhou Hoo, Hebei Hongtao, Lianyungang Zhonghong) are traders, not producers; excluded.
13. Companies named as producers by chyxx but not mapped for lack of a location/product source: Shandong Haitian, Weifang Haizhiyuan, Qingdao Alkali, Hengyang Aijie. Hubei Shuanghuan's own investor-relations records and Longbridge profile do not mention bicarbonate; only the Sohu scope and CNPP list do.
14. Tangshan Sanyou and Hebang Biotechnology: no bicarbonate statement found in fetched documents; not included.

## 4. Political/border cautions

Khunjerab (Pakistan border) is in an area subject to competing claims; only the Chinese-side crossing point is given. Taiwan, Hong Kong, Macau ports and North Korea crossings are not included. Borders drawn by the viewer are Natural Earth de facto lines.
