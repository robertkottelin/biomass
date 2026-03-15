import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SatelliteImagery from './SatelliteImagery';

// Mock Leaflet
jest.mock('leaflet', () => ({
  latLngBounds: jest.fn(() => ({})),
  imageOverlay: jest.fn(() => ({
    addTo: jest.fn(),
    setOpacity: jest.fn(),
    bringToFront: jest.fn(),
  })),
}));

// Mock api module
jest.mock('./api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(() => Promise.resolve({ features: [] })),
  },
}));

describe('SatelliteImagery', () => {
  const defaultProps = {
    mapRef: { current: { removeLayer: jest.fn() } },
    dates: ['2024-07-01', '2024-07-15'],
    selectedForest: {
      coords: [[60.15, 24.85], [60.15, 25.05], [60.25, 25.05], [60.25, 24.85]],
    },
    isDemo: false,
  };

  test('renders the control panel with title and toggle', () => {
    render(<SatelliteImagery {...defaultProps} />);
    expect(screen.getByText('Satellite Imagery')).toBeInTheDocument();
    expect(screen.getByText('Show Satellite Imagery')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('toggle checkbox shows controls when checked', () => {
    render(<SatelliteImagery {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox');

    // Controls should not be visible initially
    expect(screen.queryByText('Acquisition Date')).not.toBeInTheDocument();

    // Toggle on
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Controls should now be visible
    expect(screen.getByText('Acquisition Date')).toBeInTheDocument();
    expect(screen.getByText('Visualization Type')).toBeInTheDocument();
    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.getByText('Load Imagery')).toBeInTheDocument();
  });

  test('shows viz type options when expanded', () => {
    render(<SatelliteImagery {...defaultProps} />);
    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('True Color')).toBeInTheDocument();
    expect(screen.getByText('NDVI Map')).toBeInTheDocument();
    expect(screen.getByText('False Color')).toBeInTheDocument();
    expect(screen.getByText('NDMI Moisture')).toBeInTheDocument();
  });

  test('shows available dates in dropdown when prop dates provided', () => {
    render(<SatelliteImagery {...defaultProps} />);
    fireEvent.click(screen.getByRole('checkbox'));

    const select = screen.getByRole('combobox');
    expect(select).not.toBeDisabled();
    expect(screen.getByText('2024-07-01')).toBeInTheDocument();
    expect(screen.getByText('2024-07-15')).toBeInTheDocument();
  });
});
