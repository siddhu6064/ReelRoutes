// Type declarations for plan-from-scratch feature dependencies
// These packages need to be installed: see mobile/package-additions.json
declare module 'react-native-google-places-autocomplete' {
  import type { TextInputProps, ViewStyle } from 'react-native'
  import type { Ref } from 'react'
  export interface GooglePlacesAutocompleteRef {
    setAddressText(text: string): void
    getAddressText(): string
    clear(): void
  }
  export interface GooglePlaceData { description: string; place_id: string }
  export interface GooglePlaceDetail { geometry: { location: { lat: number; lng: number } } }
  export interface GooglePlacesAutocompleteProps {
    ref?: Ref<GooglePlacesAutocompleteRef>
    placeholder?: string
    onPress?: (data: GooglePlaceData, detail: GooglePlaceDetail | null) => void
    onFail?: (error: unknown) => void
    query?: Record<string, string>
    fetchDetails?: boolean
    styles?: Record<string, unknown>
    enablePoweredByContainer?: boolean
    minLength?: number
    debounce?: number
    keepResultsAfterBlur?: boolean
    keyboardShouldPersistTaps?: 'always' | 'never' | 'handled'
    textInputProps?: TextInputProps & { onChangeText?: (text: string) => void }
  }
  export const GooglePlacesAutocomplete: React.ForwardRefExoticComponent<GooglePlacesAutocompleteProps>
}

declare module 'react-native-draggable-flatlist' {
  import type { FlatListProps } from 'react-native'
  export interface RenderItemParams<T> {
    item: T
    getIndex: () => number | undefined
    drag: () => void
    isActive: boolean
  }
  export interface DraggableFlatListProps<T> extends Omit<FlatListProps<T>, 'renderItem'> {
    data: T[]
    renderItem: (params: RenderItemParams<T>) => React.ReactElement | null
    keyExtractor: (item: T, index: number) => string
    onDragEnd: (params: { from: number; to: number; data: T[] }) => void
    scrollEnabled?: boolean
    activationDistance?: number
  }
  export default function DraggableFlatList<T>(props: DraggableFlatListProps<T>): React.ReactElement
  export function ScaleDecorator(props: { children: React.ReactNode }): React.ReactElement
}

declare module '@gorhom/bottom-sheet' {
  import type { ViewStyle } from 'react-native'
  export interface BottomSheetProps {
    ref?: React.Ref<BottomSheet>
    index?: number
    snapPoints: (string | number)[]
    enablePanDownToClose?: boolean
    onChange?: (index: number) => void
    handleIndicatorStyle?: ViewStyle
    backgroundStyle?: ViewStyle
    children?: React.ReactNode
  }
  export default class BottomSheet extends React.Component<BottomSheetProps> {
    expand(): void
    close(): void
    snapToIndex(index: number): void
  }
  export function BottomSheetScrollView(props: { children?: React.ReactNode; contentContainerStyle?: ViewStyle }): React.ReactElement
  export function BottomSheetView(props: { children?: React.ReactNode; style?: ViewStyle }): React.ReactElement
}

declare module 'expo-haptics' {
  export enum ImpactFeedbackStyle { Light = 'impactLight', Medium = 'impactMedium', Heavy = 'impactHeavy' }
  export enum NotificationFeedbackType { Success = 'notificationSuccess', Warning = 'notificationWarning', Error = 'notificationError' }
  export function impactAsync(style?: ImpactFeedbackStyle): Promise<void>
  export function notificationAsync(type?: NotificationFeedbackType): Promise<void>
}
