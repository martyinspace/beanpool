import React, { useEffect, useState } from 'react';
import { Text, Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSavedNodes } from '../utils/nodes';

export function useCurrencyString() {
    const [cType, setCType] = useState<'text' | 'image'>('image');
    const [cVal, setCVal] = useState<string>('bean');

    useEffect(() => {
        let mounted = true;
        (async () => {
            const activeUrl = await AsyncStorage.getItem('beanpool_anchor_url');
            if (activeUrl) {
                const nodes = await getSavedNodes();
                const active = nodes.find(n => n.url === activeUrl);
                if (active && mounted) {
                    if (active.currencyType) setCType(active.currencyType);
                    if (active.currencyValue) setCVal(active.currencyValue);
                }
            }
        })();
        return () => { mounted = false; };
    }, []);

    if (cType === 'image') {
        if (cVal === 'bean') return 'Beans';
        return cVal;
    }
    return cVal || 'Ʀ';
}

interface Props {
    amount?: number | string;
    style?: any;
    hideAmount?: boolean;
}

export function CurrencyDisplay({ amount, style, hideAmount = false }: Props) {
    const [cType, setCType] = useState<'text' | 'image'>('image');
    const [cVal, setCVal] = useState<string>('bean');

    useEffect(() => {
        let mounted = true;
        (async () => {
            const activeUrl = await AsyncStorage.getItem('beanpool_anchor_url');
            if (activeUrl) {
                const nodes = await getSavedNodes();
                const active = nodes.find(n => n.url === activeUrl);
                if (active && mounted) {
                    if (active.currencyType) setCType(active.currencyType);
                    if (active.currencyValue) setCVal(active.currencyValue);
                }
            }
        })();
        return () => { mounted = false; };
    }, []);

    const amtStr = (!hideAmount && amount !== undefined) ? amount.toString() + '\u00A0' : '';
    
    const flatStyle = StyleSheet.flatten(style) || {};
    const fontSize = flatStyle.fontSize ? flatStyle.fontSize * 1.05 : 18;
    const translateY = Math.max(2, fontSize * 0.15);

    if (cType === 'image' && cVal === 'bean') {
        return (
            <Text style={[style, { textAlignVertical: 'center' }]}>
                {amtStr}
                <Image 
                    source={require('../assets/images/bean.png')} 
                    style={{ width: fontSize, height: fontSize, resizeMode: 'contain', transform: [{translateY}] }} 
                />
            </Text>
        );
    }

    // Fallback or explicit text node (e.g., 'Ʀ' or 'rocks')
    const displayVal = cType === 'text' ? (cVal || 'Ʀ') : 'Ʀ';
    return (
        <Text style={style}>
            {amtStr}{displayVal}
        </Text>
    );
}
