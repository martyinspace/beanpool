import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, SafeAreaView } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import Slider from '@react-native-community/slider';

// Default to Mullumbimby for the demo/mock
const DEFAULT_LAT = -28.5523;
const DEFAULT_LNG = 153.4991;

interface RadiusPickerModalProps {
    visible: boolean;
    initialRadius: number | null;
    onApply: (radius: number) => void;
    onCancel: () => void;
    onReset: () => void;
}

export function RadiusPickerModal({ visible, initialRadius, onApply, onCancel, onReset }: RadiusPickerModalProps) {
    const [radius, setRadius] = useState<number>(initialRadius || 50);

    const region = {
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LNG,
        latitudeDelta: (radius / 111) * 2.5, // Rough zoom estimation based on radius
        longitudeDelta: (radius / 111) * 2.5,
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
            <View style={styles.container}>
                <SafeAreaView style={styles.header}>
                    <Pressable onPress={onCancel} style={styles.headerBtn}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                    <Text style={styles.title}>📍 Set Location & Radius</Text>
                    <Pressable onPress={onReset} style={styles.headerBtn}>
                        <Text style={styles.resetText}>Reset</Text>
                    </Pressable>
                </SafeAreaView>

                <View style={styles.mapContainer}>
                    <MapView 
                        style={styles.map} 
                        initialRegion={region}
                        region={region}
                        provider={PROVIDER_GOOGLE}
                        customMapStyle={mapStyle}
                    >
                        <Marker coordinate={{ latitude: DEFAULT_LAT, longitude: DEFAULT_LNG }} />
                        <Circle 
                            center={{ latitude: DEFAULT_LAT, longitude: DEFAULT_LNG }}
                            radius={radius * 1000} // meters
                            strokeWidth={2}
                            strokeColor="#fbbf24"
                            lineDashPattern={[5, 5]}
                            fillColor="rgba(251, 191, 36, 0.15)"
                        />
                    </MapView>
                </View>

                <View style={styles.bottomPanel}>
                    <View style={styles.radiusHeaderRow}>
                        <Text style={styles.radiusLabel}>Search radius</Text>
                        <Text style={styles.radiusValue}>{radius} km</Text>
                    </View>
                    
                    <Slider
                        style={styles.slider}
                        minimumValue={1}
                        maximumValue={100}
                        step={1}
                        value={radius}
                        onValueChange={(val) => setRadius(val)}
                        minimumTrackTintColor="#d97706"
                        maximumTrackTintColor="#4b5563"
                        thumbTintColor="#f3f4f6"
                    />
                    
                    <View style={styles.sliderLabels}>
                        <Text style={styles.sliderLabel}>1km</Text>
                        <Text style={styles.sliderLabel}>10km</Text>
                        <Text style={styles.sliderLabel}>50km</Text>
                        <Text style={styles.sliderLabel}>100km</Text>
                    </View>

                    <Text style={styles.hintText}>Tap the map to move the center point</Text>

                    <Pressable style={styles.applyBtn} onPress={() => onApply(radius)}>
                        <Text style={styles.applyBtnText}>Apply — {radius}km radius</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1f2937',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#262626',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#404040',
    },
    headerBtn: {
        padding: 8,
    },
    cancelText: {
        color: '#9ca3af',
        fontSize: 16,
    },
    resetText: {
        color: '#ef4444',
        fontSize: 16,
    },
    title: {
        color: '#f3f4f6',
        fontSize: 18,
        fontWeight: '700',
    },
    mapContainer: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    bottomPanel: {
        backgroundColor: '#262626',
        padding: 24,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderTopColor: '#404040',
    },
    radiusHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    radiusLabel: {
        color: '#9ca3af',
        fontSize: 16,
    },
    radiusValue: {
        color: '#fbbf24',
        fontSize: 18,
        fontWeight: 'bold',
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 24,
    },
    sliderLabel: {
        color: '#6b7280',
        fontSize: 12,
    },
    hintText: {
        color: '#6b7280',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
    },
    applyBtn: {
        backgroundColor: '#d97706',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    applyBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

const mapStyle = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#f5f5f5"
      }
    ]
  },
  {
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#f5f5f5"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#bdbdbd"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#eeeeee"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#e5e5e5"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#ffffff"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dadada"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#e5e5e5"
      }
    ]
  },
  {
    "featureType": "transit.station",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#eeeeee"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#c9c9c9"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  }
];
