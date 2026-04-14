import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function InviteProxyScreen() {
    const { hash } = useLocalSearchParams();
    const router = useRouter();

    useEffect(() => {
        if (hash) {
            router.replace({ pathname: '/welcome', params: { invite: hash } });
        } else {
            router.replace('/welcome');
        }
    }, [hash]);

    return null;
}
