import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock leaflet and react-leaflet since they require DOM/canvas
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  FeatureGroup: ({ children }) => <div>{children}</div>,
  Polygon: () => <div />,
  useMap: () => ({
    addLayer: jest.fn(),
    removeLayer: jest.fn(),
    addControl: jest.fn(),
    removeControl: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  }),
}));

jest.mock('leaflet', () => {
  const L = {
    Icon: { Default: { prototype: { _getIconUrl: '' }, mergeOptions: jest.fn() } },
    FeatureGroup: jest.fn(() => ({ addLayer: jest.fn() })),
    Control: { Draw: jest.fn() },
    Draw: { Event: { CREATED: 'draw:created', DELETED: 'draw:deleted' } },
    control: { draw: jest.fn() },
  };
  return L;
});

jest.mock('recharts', () => ({
  Line: () => <div />,
  LineChart: ({ children }) => <div>{children}</div>,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('renders authentication form with inputs', () => {
    render(<App />);
    // Should have client ID and client secret inputs
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the map container', () => {
    render(<App />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders forest type selector with all 4 species', () => {
    render(<App />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    const optionTexts = options.map(o => o.textContent.toLowerCase());
    expect(optionTexts.some(t => t.includes('pine'))).toBe(true);
    expect(optionTexts.some(t => t.includes('fir') || t.includes('spruce'))).toBe(true);
    expect(optionTexts.some(t => t.includes('birch'))).toBe(true);
    expect(optionTexts.some(t => t.includes('aspen'))).toBe(true);
  });
});
