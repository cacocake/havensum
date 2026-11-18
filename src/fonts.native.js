import {useFonts} from 'expo-font';
export function useHavensumFonts() {
  return useFonts({
    'DM Sans': require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
    'Fredoka': require('@expo-google-fonts/fredoka/400Regular/Fredoka_400Regular.ttf')
  });
}
