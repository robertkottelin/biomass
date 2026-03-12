import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock react-router-dom (ESM module not compatible with Jest CJS)
jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => <div>{children}</div>,
  Routes: ({ children }) => <div>{children}</div>,
  Route: ({ element }) => element || <div />,
  Navigate: () => <div />,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/' }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}));

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
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => <div />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  ReferenceLine: () => <div />,
}));

// Mock AuthContext
jest.mock('./AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }) => <div>{children}</div>,
}));

// Mock api
jest.mock('./api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({})),
    post: jest.fn(() => Promise.resolve({})),
    postRaw: jest.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })),
  },
}));

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('renders landing page content', () => {
    render(<App />);
    expect(screen.getByText(/Satellite-Powered Forest Analytics/i)).toBeInTheDocument();
  });
});
