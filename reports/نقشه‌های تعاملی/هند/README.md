# India competitor map (interactive)

Self-contained page: `india_map.html` (open in a browser; needs internet only for d3 from cdnjs and the Vazirmatn font from Google Fonts).

- Basemap: Natural Earth 50m countries, embedded inline (GeoJSON) in the HTML.
- Data: also exported as `india_map_data.json` (same object that is embedded in the HTML):
  - `F` producers (id, name, company, lon/lat, capacity text + quality grade, grades, notes, coordinate quality)
  - `D` destinations: ports / land borders / consumption hubs (type `t` = port | border | market)
  - `dist[factoryId][destId]` road distance in metres (OSRM / OpenStreetMap)
  - `roads["factoryId|destId"]` real road geometry (lon/lat) for 15 key routes; other lines are schematic arcs
- Rail distances are NOT measured; the "suggested mode" column is a distance-based rule only.
- To embed in the Next.js platform: render the same markup in a client component (d3 loaded from npm `d3`), keep the DATA object in `data/` and the GeoJSON in `public/`.
