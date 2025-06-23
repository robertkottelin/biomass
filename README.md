# Forest Biomass Analysis - Sentinel-2 Integration

This React-based web application provides an interactive platform for analyzing forest biomass using satellite data from the Sentinel-2 mission, accessed via the Copernicus Data Space Ecosystem API. Users can define forest areas on a map, retrieve historical satellite imagery, calculate the Normalized Difference Vegetation Index (NDVI), estimate biomass using an empirical model, and visualize the results in a time-series graph.

## Table of Contents
- [Forest Biomass Analysis - Sentinel-2 Integration](#forest-biomass-analysis---sentinel-2-integration)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Features](#features)
  - [Technical Architecture](#technical-architecture)
  - [Data Retrieval](#data-retrieval)
    - [Authentication](#authentication)
    - [Searching Sentinel-2 Products](#searching-sentinel-2-products)
  - [Data Processing](#data-processing)
    - [NDVI Calculation](#ndvi-calculation)
    - [Biomass Estimation](#biomass-estimation)
    - [Data Sorting and Aggregation](#data-sorting-and-aggregation)
  - [Calculations](#calculations)
    - [Area Calculation](#area-calculation)
    - [Growth Trend Calculation](#growth-trend-calculation)
  - [Graph and Visualization](#graph-and-visualization)
  - [Usage Instructions](#usage-instructions)
  - [References](#references)

---

## Overview
The Forest Biomass Analysis application integrates Sentinel-2 satellite imagery to estimate forest biomass over time. It is designed for environmental researchers, forest managers, and developers interested in remote sensing applications. Key capabilities include:
- User authentication with the Copernicus Data Space Ecosystem.
- Interactive map-based polygon drawing to define forest areas.
- NDVI and biomass calculations based on satellite data.
- Visualization of historical trends and growth analysis.

The application is built with React, Leaflet for mapping, and Recharts for data visualization, ensuring a responsive and interactive user experience.

---

## Features
- **User Authentication**: Secure OAuth2-based login with Copernicus credentials.
- **Map Interface**: Leaflet-powered map with polygon drawing tools via Leaflet Draw.
- **Forest Type Selection**: Options for pine, fir, birch, and aspen with tailored biomass parameters.
- **Data Retrieval**: Access to Sentinel-2 Level-2A products filtered by date, cloud coverage, and spatial extent.
- **NDVI Calculation**: Simulated NDVI computation based on seasonal patterns (placeholder for production-grade band processing).
- **Biomass Estimation**: Empirical exponential model converting NDVI to biomass.
- **Time Series Visualization**: Interactive chart displaying NDVI, biomass, and annual means.
- **Growth Trend Analysis**: Percentage change in biomass over user-defined periods.

---

## Technical Architecture
The application is a single-page React application with the following components:
- **MapContainer**: Renders the map using `react-leaflet` with Esri World Imagery and labels as base layers.
- **DrawControl**: Custom component integrating Leaflet Draw for polygon creation and deletion.
- **Authentication Section**: Manages OAuth2 token acquisition from Copernicus.
- **Controls Section**: UI for selecting forest type and cloud coverage threshold.
- **Chart Container**: Uses `recharts` to visualize processed data.
- **State Management**: React hooks (`useState`, `useEffect`, `useCallback`, `useRef`) handle application state and side effects.

External libraries are loaded via CDN (e.g., Leaflet, Leaflet Draw, Leaflet GeometryUtil, Recharts).

---

## Data Retrieval
### Authentication
- **API**: Copernicus Data Space Ecosystem API.
- **Endpoint**: `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`
- **Method**: POST with `application/x-www-form-urlencoded` content type.
- **Parameters**:
  - `client_id`: `cdse-public`
  - `grant_type`: `password`
  - `username`: User-provided Copernicus username.
  - `password`: User-provided Copernicus password.
- **Response**: JSON containing an `access_token`, stored in state and used for API authorization.

### Searching Sentinel-2 Products
- **API Endpoint**: `https://catalogue.dataspace.copernicus.eu/odata/v1/Products`
- **Query Construction**:
  - **Collection**: `SENTINEL-2`
  - **Product Type**: `S2MSI2A` (Level-2A, atmospherically corrected).
  - **Spatial Filter**: OGC WKT `POLYGON` string from user-drawn coordinates, transformed to `lon,lat` order and closed by repeating the first coordinate.
  - **Temporal Filter**: From `2015-07-01` (Sentinel-2A launch) to the current date, batched by year.
  - **Cloud Coverage**: User-defined maximum (e.g., 20%), applied via OData filter.
- **OData Query Example**:
  ```
  Collection/Name eq 'SENTINEL-2' and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((lon1 lat1, lon2 lat2, ...))') and ContentDate/Start gt 2015-07-01T00:00:00.000Z and ContentDate/Start lt 2023-12-31T00:00:00.000Z and Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value le 20.00) and Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'S2MSI2A')
  ```
- **Sorting**: Ordered by `ContentDate/Start` for chronological consistency.
- **Batching**: Yearly batches prevent API overload, with a 500ms delay between requests to avoid rate limits.
- **Response**: Array of product metadata, including `Id`, `Name`, `ContentDate`, `GeoFootprint`, and `Attributes`.

---

## Data Processing
### NDVI Calculation
NDVI is typically calculated as:

\[
\text{NDVI} = \frac{\text{NIR} - \text{R}}{\text{NIR} + \text{R}}
\]

- **Bands**:
  - **NIR**: Sentinel-2 Band 8 (Near-Infrared, 10m resolution).
  - **R**: Sentinel-2 Band 4 (Red, 10m resolution).
- **Current Implementation**: Due to web environment constraints, NDVI is simulated using a seasonal sine wave model with random variation:
  - Day of year approximated as `(month - 1) * 30 + day`.
  - Seasonal factor: `0.3 * sin(2 * π * (dayOfYear - 80) / 365) + 0.5`.
  - Random variation: `±0.1`.
  - Clamped to `[0, 1]`.
- **Production Note**: Full implementation requires downloading products and processing with `rasterio` or accessing bands via the Sentinel Hub Process API.

### Biomass Estimation
Biomass is derived from NDVI using an empirical exponential model:

\[
\text{biomass} = a \times e^{b \times \text{NDVI}} \times \frac{\text{maxBiomass}}{10}
\]

- **Parameters** (stored in `forestParams`):
  - **Pine**: `{ maxBiomass: 350, a: 0.7, b: 1.2 }`
  - **Fir**: `{ maxBiomass: 400, a: 0.75, b: 1.15 }`
  - **Birch**: `{ maxBiomass: 250, a: 0.65, b: 1.3 }`
  - **Aspen**: `{ maxBiomass: 200, a: 0.6, b: 1.35 }`
- **Units**: Biomass in tons/ha, scaled by forest type-specific maximum biomass.

### Data Sorting and Aggregation
- **Sorting**: Biomass data is sorted by `date` using JavaScript’s `sort` with a date comparison.
- **Annual Means**: Biomass values are grouped by year, and the mean is calculated:
  - `yearlyBiomass[year]` accumulates biomass values.
  - Mean per year: `sum / count`.
  - Added to each data point as `biomassMean`.

---

## Calculations
### Area Calculation
Polygon area is computed in hectares:
1. **Primary Method**: `L.GeometryUtil.geodesicArea(coords) / 10000` (if Leaflet GeometryUtil is loaded).
2. **Fallback Method**: Shoelace formula adjusted for latitude:
   \[
   \text{area} = \left| \sum_{i=0}^{n-1} (\text{lat}_i \times \text{lng}_{i+1} - \text{lat}_{i+1} \times \text{lng}_i) \right| \times 111319.9^2 \times \cos(\text{lat}_0) / 2 / 10000
   \]
   - `111319.9`: Degrees to meters conversion factor.
   - `cos(lat0)`: Adjusts for latitude distortion.
   - Result formatted to 2 decimal places.

### Growth Trend Calculation
The growth trend is the percentage change in mean biomass over a selected period:
\[
\text{trend} = \left( \frac{\text{lastYearMean} - \text{firstYearMean}}{\text{firstYearMean}} \times 100 \right)\%
\]
- **Steps**:
  1. Filter data by `trendStartDate` and `trendEndDate` (defaults to full range if unset).
  2. Group by year and compute mean biomass per year.
  3. Extract first and last year means.
  4. Calculate percentage change, displayed with years and values (e.g., "12.3% (2015-2023, from 200.0 to 224.6 tons/ha)").

---

## Graph and Visualization
The application uses `recharts` to render an interactive `LineChart`:
- **Setup**:
  - Wrapped in `ResponsiveContainer` for dynamic sizing (100% width, 400px height).
  - `CartesianGrid` with dashed lines for readability.
- **Axes**:
  - **X-Axis**: `dataKey="date"`, rotated 45° for legibility, interval adjusted to show ~20 ticks.
  - **Y-Axis (Left)**: Biomass (tons/ha), labeled “Biomass (tons/ha)”.
  - **Y-Axis (Right)**: NDVI, domain `[-0.2, 1]`, labeled “NDVI”.
- **Data Series**:
  - **Scene Biomass**: Green dots (`#82ca9d`), `yAxisId="biomass"`, no line (`strokeWidth={0}`), `dot={r: 2}`.
  - **Scene NDVI**: Purple dots (`#8884d8`), `yAxisId="ndvi"`, no line.
  - **Annual Mean Biomass**: Red line (`#ff0000`), `strokeWidth={3}`, no dots.
- **Tooltip**: Custom component showing date, NDVI, biomass, annual mean (if present), and cloud cover in a styled box.
- **Legend**: Identifies each series by name.
- **Interactivity**: Users can set `trendStartDate` and `trendEndDate` via date inputs to filter the growth trend calculation.

---

## Usage Instructions
1. **Authenticate**: Enter Copernicus credentials and click "Authenticate with CDSE."
2. **Select Forest Type**: Choose from pine, fir, birch, or aspen in the dropdown.
3. **Draw Polygon**: Use the map’s drawing tool to outline a forest area.
4. **Fetch Data**: Click "Analyze Full Sentinel-2 Archive" to retrieve and process data.
5. **View Results**: Explore the chart with NDVI, biomass, and annual means.
6. **Analyze Trends**: Set a date range to compute the biomass growth trend.

---

## References
- **Copernicus Data Space Ecosystem**: [Documentation](https://dataspace.copernicus.eu/)
- **Sentinel-2 Mission**: [ESA Sentinel-2](https://sentinel.esa.int/web/sentinel/missions/sentinel-2)
- **Leaflet**: [Leaflet Documentation](https://leafletjs.com/)
- **Leaflet Draw**: [GitHub](https://github.com/Leaflet/Leaflet.draw)
- **Leaflet GeometryUtil**: [CDN](https://cdnjs.com/libraries/leaflet-geometryutil)
- **Recharts**: [Recharts Documentation](https://recharts.org/)
- **NDVI**: [USGS NDVI](https://www.usgs.gov/landsat-missions/landsat-normalized-difference-vegetation-index)
- **Biomass Models**: General reference to empirical NDVI-biomass relationships in forestry literature.

This README provides a detailed technical guide to the application’s functionality, suitable for developers and advanced users seeking to understand or extend its capabilities.