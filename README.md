# Forest Biomass Analysis - Sentinel-2 Integration

This React-based web application enables users to analyze forest biomass using real-time satellite data from the Sentinel-2 mission, accessed via the Copernicus Data Space Ecosystem API. Users can define forest areas on an interactive map, retrieve historical satellite imagery, calculate the Normalized Difference Vegetation Index (NDVI) using actual satellite bands, estimate biomass with a forest type-specific model, and visualize trends in an interactive chart.

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Technical Architecture](#technical-architecture)
4. [Authentication](#authentication)
5. [Data Retrieval](#data-retrieval)
6. [NDVI Calculation](#ndvi-calculation)
7. [Biomass Estimation](#biomass-estimation)
8. [Visualization and Analysis](#visualization-and-analysis)
9. [Usage Instructions](#usage-instructions)
10. [References](#references)

---

## Overview
The Forest Biomass Analysis application integrates real-time Sentinel-2 satellite data to estimate forest biomass over time. It is designed for environmental researchers, forest managers, and developers interested in remote sensing applications. Key capabilities include:
- OAuth2-based authentication with the Copernicus Data Space Ecosystem.
- Interactive map for defining forest areas via polygon drawing.
- Real-time NDVI calculation using Sentinel-2 bands via the Sentinel Hub Process API.
- Biomass estimation using an empirical model tailored to specific forest types.
- Time-series visualization with growth trend analysis.

The application is built with React, Leaflet for mapping, and Recharts for data visualization, ensuring a responsive and interactive user experience.

---

## Features
- **OAuth2 Authentication**: Secure login using client credentials stored in environment variables.
- **Map Interface**: Leaflet-powered map with polygon drawing tools via Leaflet Draw.
- **Forest Type Selection**: Supports pine, fir, birch, and aspen with tailored biomass parameters.
- **Data Retrieval**: Access to Sentinel-2 Level-2A products filtered by date, cloud coverage, and spatial extent.
- **Real-time NDVI Calculation**: Uses Sentinel Hub Process API to compute NDVI from actual satellite bands.
- **Biomass Estimation**: Empirical exponential model converts NDVI to biomass.
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

## Authentication
- **Flow**: OAuth2 Client Credentials Flow.
- **Credentials**: Stored in environment variables `REACT_APP_CLIENT_ID` and `REACT_APP_CLIENT_SECRET`.
- **Token Endpoint**: `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`
- **Request**:
  - Method: POST
  - Body: `grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>`
- **Response**: JSON containing `access_token`, used for API authorization.
- **Token Expiry**: Typically 600 seconds (10 minutes).

**Note**: Users must register on [dataspace.copernicus.eu](https://dataspace.copernicus.eu/) and create OAuth2 client credentials in their user settings.

---

## Data Retrieval
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

## NDVI Calculation
NDVI is calculated using real-time satellite data via the **Sentinel Hub Process API**:
- **API Endpoint**: `https://sh.dataspace.copernicus.eu/api/v1/process`
- **Evalscript**:
  - **Input Bands**: `B04` (Red), `B08` (NIR), `SCL` (Scene Classification Layer).
  - **Cloud Masking**: Uses SCL to filter out clouds, shadows, and snow (classes 0, 1, 3, 8, 9, 10, 11).
  - **NDVI Formula**:
    \[
    \text{NDVI} = \frac{\text{B08} - \text{B04}}{\text{B08} + \text{B04}}
    \]
  - **Output**: Single-band float32 GeoTIFF with NDVI values, NaN for masked pixels.
- **Processing**:
  - The API request includes the user-defined polygon and date range.
  - The response is a GeoTIFF, from which the mean NDVI is calculated by averaging valid (non-NaN) pixel values.
- **Note**: NDVI is not simulated; it is computed directly from Sentinel-2 imagery. A fallback to a seasonal model is used only if the API fails, but the primary method relies on real-time data.

---

## Biomass Estimation
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

---

## Visualization and Analysis
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

## Usage Instructions
1. **Set Up OAuth2 Credentials**:
   - Register on [dataspace.copernicus.eu](https://dataspace.copernicus.eu/).
   - Create OAuth2 client credentials in User Settings.
   - Add to `.env` file:
     ```
     REACT_APP_CLIENT_ID=your_client_id
     REACT_APP_CLIENT_SECRET=your_client_secret
     ```
2. **Authenticate**: Click "Authenticate with CDSE" (credentials are sourced from `.env`).
3. **Select Forest Type**: Choose from pine, fir, birch, or aspen.
4. **Draw Polygon**: Use the map’s drawing tool to outline a forest area.
5. **Fetch Data**: Click "Analyze Full Sentinel-2 Archive" to retrieve and process data.
6. **View Results**: Explore the chart with NDVI, biomass, and annual means.
7. **Analyze Trends**: Set a date range to compute the biomass growth trend.

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