import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import VegetationStatistics from './VegetationStatistics';

jest.mock('recharts', () => {
  const MockChart = ({ children, ...props }) => <div data-testid="mock-chart" {...props}>{children}</div>;
  return {
    AreaChart: MockChart, Area: () => null, BarChart: MockChart, Bar: () => null,
    Cell: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
    Tooltip: () => null, Legend: () => null, ResponsiveContainer: ({ children }) => <div>{children}</div>,
    LineChart: MockChart, Line: () => null,
  };
});

const makeBins = () => [
  { lowEdge: -0.2, highEdge: 0.0, count: 5 },
  { lowEdge: 0.0, highEdge: 0.1, count: 8 },
  { lowEdge: 0.1, highEdge: 0.2, count: 10 },
  { lowEdge: 0.2, highEdge: 0.3, count: 15 },
  { lowEdge: 0.3, highEdge: 0.4, count: 20 },
  { lowEdge: 0.4, highEdge: 0.5, count: 18 },
  { lowEdge: 0.5, highEdge: 0.6, count: 12 },
  { lowEdge: 0.6, highEdge: 0.7, count: 8 },
  { lowEdge: 0.7, highEdge: 0.8, count: 3 },
  { lowEdge: 0.8, highEdge: 1.0, count: 1 },
];

const makeEntry = (date) => ({
  interval: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` },
  outputs: {
    ndvi: {
      bands: {
        B0: {
          stats: { min: 0.3, max: 0.8, mean: 0.6, stDev: 0.1, sampleCount: 100, noDataCount: 10 },
          histogram: { bins: makeBins(), overflowCount: 0, underflowCount: 0 },
          percentiles: { '5.0': 0.35, '25.0': 0.48, '50.0': 0.6, '75.0': 0.72, '95.0': 0.82 },
        },
      },
    },
    ndmi: {
      bands: {
        B0: {
          stats: { min: 0.1, max: 0.5, mean: 0.3, stDev: 0.08, sampleCount: 100, noDataCount: 10 },
          histogram: { bins: makeBins(), overflowCount: 0, underflowCount: 0 },
          percentiles: { '5.0': 0.15, '25.0': 0.22, '50.0': 0.3, '75.0': 0.38, '95.0': 0.45 },
        },
      },
    },
    ndre: {
      bands: {
        B0: {
          stats: { min: 0.1, max: 0.5, mean: 0.3, stDev: 0.07, sampleCount: 100, noDataCount: 10 },
          histogram: { bins: makeBins(), overflowCount: 0, underflowCount: 0 },
          percentiles: { '5.0': 0.15, '25.0': 0.22, '50.0': 0.3, '75.0': 0.38, '95.0': 0.45 },
        },
      },
    },
  },
});

const mockData = {
  data: [
    makeEntry('2024-07-01'),
    makeEntry('2024-07-15'),
  ],
};

describe('VegetationStatistics', () => {
  test('renders null when data is null', () => {
    const { container } = render(<VegetationStatistics data={null} loading={false} />);
    expect(container.innerHTML).toBe('');
  });

  test('shows loading state when loading=true', () => {
    render(<VegetationStatistics data={null} loading={true} />);
    expect(screen.getByText('Loading vegetation statistics...')).toBeInTheDocument();
  });

  test('renders all 4 visualization sections with valid data', () => {
    render(<VegetationStatistics data={mockData} loading={false} />);

    expect(screen.getByText('Vegetation Statistics Dashboard')).toBeInTheDocument();
    expect(screen.getByText('NDVI Percentile Distribution Over Time')).toBeInTheDocument();
    expect(screen.getByText('Vegetation Index Variability')).toBeInTheDocument();
    expect(screen.getByText('NDVI Pixel Distribution')).toBeInTheDocument();
    expect(screen.getByText('Vegetation Density Classes')).toBeInTheDocument();

    // Date range subtitle
    expect(screen.getByText('2024-07-01 to 2024-07-15')).toBeInTheDocument();

    // Charts rendered
    const charts = screen.getAllByTestId('mock-chart');
    expect(charts.length).toBeGreaterThanOrEqual(3);
  });

  test('date dropdown works for histogram selection', () => {
    render(<VegetationStatistics data={mockData} loading={false} />);

    // There are two date selects (histogram + veg classes), grab the first
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBe(2);

    // Both should start at index 0 (first date)
    expect(selects[0].value).toBe('0');

    // Change to second date
    fireEvent.change(selects[0], { target: { value: '1' } });
    expect(selects[0].value).toBe('1');

    // Both selects share the same state, so the second should also update
    expect(selects[1].value).toBe('1');
  });
});
