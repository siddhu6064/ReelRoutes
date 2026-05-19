import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../../src/store/appStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { lightTheme, NeumorphicCard, SegmentedControl, ListItemRow, ToggleSwitch, Divider } from '../../src/components/NeumorphicUI';
import { TransactionType } from '../../src/types';
import { getCategoryEmoji } from '@shared/constants';
import api from '../../src/services/api';
import {
  canSubmitTransaction,
  getTransactionSaveErrorMessage,
  isRetryableTransactionSaveError,
} from '../../src/utils/transactionRetryState';

const FREQUENCY_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'bimonthly', label: 'Bimonthly' },
  { value: 'quarterly', label: 'Every 3 Months' },
  { value: 'semiannually', label: 'Every 6 Months' },
  { value: 'yearly', label: 'Yearly' },
];

// Custom Date/Time Picker Modal
function DateTimePickerModal({ 
  visible, 
  mode,
  value, 
  onSelect, 
  onClose 
}: { 
  visible: boolean;
  mode: 'date' | 'time';
  value: Date; 
  onSelect: (value: Date) => void; 
  onClose: () => void;
}) {
  const [selectedYear, setSelectedYear] = useState(value.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(value.getMonth());
  const [selectedDay, setSelectedDay] = useState(value.getDate());
  const [selectedHour, setSelectedHour] = useState(value.getHours());
  const [selectedMinute, setSelectedMinute] = useState(value.getMinutes());

  useEffect(() => {
    if (visible) {
      setSelectedYear(value.getFullYear());
      setSelectedMonth(value.getMonth());
      setSelectedDay(value.getDate());
      setSelectedHour(value.getHours());
      setSelectedMinute(value.getMinutes());
    }
  }, [visible, value]);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1);
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const handleConfirm = () => {
    const newDate = new Date(selectedYear, selectedMonth, selectedDay, selectedHour, selectedMinute);
    onSelect(newDate);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.container}>
          <View style={pickerStyles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={pickerStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={pickerStyles.title}>{mode === 'date' ? 'Select Date' : 'Select Time'}</Text>
            <TouchableOpacity onPress={handleConfirm}>
              <Text style={pickerStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>

          {mode === 'date' ? (
            <>
              <Text style={pickerStyles.sectionLabel}>Month</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pickerStyles.scrollRow}>
                {months.map((month, index) => (
                  <TouchableOpacity
                    key={month}
                    style={[pickerStyles.option, selectedMonth === index && pickerStyles.optionSelected]}
                    onPress={() => setSelectedMonth(index)}
                  >
                    <Text style={[pickerStyles.optionText, selectedMonth === index && pickerStyles.optionTextSelected]}>
                      {month}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={pickerStyles.sectionLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pickerStyles.scrollRow}>
                {days.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[pickerStyles.dayOption, selectedDay === day && pickerStyles.optionSelected]}
                    onPress={() => setSelectedDay(day)}
                  >
                    <Text style={[pickerStyles.optionText, selectedDay === day && pickerStyles.optionTextSelected]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={pickerStyles.sectionLabel}>Year</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pickerStyles.scrollRow}>
                {years.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[pickerStyles.option, selectedYear === year && pickerStyles.optionSelected]}
                    onPress={() => setSelectedYear(year)}
                  >
                    <Text style={[pickerStyles.optionText, selectedYear === year && pickerStyles.optionTextSelected]}>
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={pickerStyles.timeContainer}>
              <View style={pickerStyles.timeColumn}>
                <Text style={pickerStyles.timeLabel}>Hour</Text>
                <ScrollView style={pickerStyles.timeScroll} showsVerticalScrollIndicator={false}>
                  {hours.map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[pickerStyles.timeOption, selectedHour === hour && pickerStyles.timeOptionSelected]}
                      onPress={() => setSelectedHour(hour)}
                    >
                      <Text style={[pickerStyles.timeOptionText, selectedHour === hour && pickerStyles.timeOptionTextSelected]}>
                        {hour.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <Text style={pickerStyles.timeSeparator}>:</Text>
              <View style={pickerStyles.timeColumn}>
                <Text style={pickerStyles.timeLabel}>Minute</Text>
                <ScrollView style={pickerStyles.timeScroll} showsVerticalScrollIndicator={false}>
                  {minutes.map((min) => (
                    <TouchableOpacity
                      key={min}
                      style={[pickerStyles.timeOption, selectedMinute === min && pickerStyles.timeOptionSelected]}
                      onPress={() => setSelectedMinute(min)}
                    >
                      <Text style={[pickerStyles.timeOptionText, selectedMinute === min && pickerStyles.timeOptionTextSelected]}>
                        {min.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  container: { backgroundColor: lightTheme.colors.cardBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: lightTheme.colors.divider },
  title: { fontSize: 17, fontWeight: '600', color: lightTheme.colors.text },
  cancelText: { fontSize: 16, color: lightTheme.colors.textTertiary },
  doneText: { fontSize: 16, fontWeight: '600', color: lightTheme.colors.primary },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: lightTheme.colors.textTertiary, marginLeft: 16, marginTop: 16, marginBottom: 8 },
  scrollRow: { paddingHorizontal: 12 },
  option: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: lightTheme.colors.background, marginHorizontal: 4 },
  optionSelected: { backgroundColor: lightTheme.colors.primary },
  optionText: { fontSize: 15, fontWeight: '600', color: lightTheme.colors.textSecondary },
  optionTextSelected: { color: '#FFF' },
  dayOption: { width: 44, height: 44, borderRadius: 22, backgroundColor: lightTheme.colors.background, marginHorizontal: 4, justifyContent: 'center', alignItems: 'center' },
  timeContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20 },
  timeColumn: { alignItems: 'center' },
  timeLabel: { fontSize: 13, color: lightTheme.colors.textTertiary, marginBottom: 8 },
  timeScroll: { height: 200 },
  timeOption: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  timeOptionSelected: { backgroundColor: lightTheme.colors.primary },
  timeOptionText: { fontSize: 20, color: lightTheme.colors.textSecondary },
  timeOptionTextSelected: { color: '#FFF', fontWeight: '600' },
  timeSeparator: { fontSize: 32, color: lightTheme.colors.text, marginHorizontal: 16 },
});

export default function AddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { activeProfile, categories, paymentMethods, expenses, createExpense, updateExpense } = useAppStore();

  const editId = params.edit as string | undefined;
  const editExpense = editId ? expenses.find(e => e.expense_id === editId) : null;
  const fromShortcut = params.fromShortcut === 'true';

  // Transaction type
  const [transactionType, setTransactionType] = useState<number>(0); // 0=Expense, 1=Income, 2=Transfer

  // Form state
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [toPaymentMethod, setToPaymentMethod] = useState(''); // For transfers
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [isPending, setIsPending] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState('never');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Modals
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showToPaymentModal, setShowToPaymentModal] = useState(false);
  const [showRepeatModal, setShowRepeatModal] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].category_id);
    }
    if (paymentMethods.length > 0 && !selectedPaymentMethod) {
      const defaultPm = paymentMethods.find(p => p.is_default) || paymentMethods[0];
      setSelectedPaymentMethod(defaultPm.payment_id);
      if (paymentMethods.length > 1) {
        setToPaymentMethod(paymentMethods[1].payment_id);
      }
    }
  }, [categories, paymentMethods]);

  // Handle deep link params from Apple Shortcuts
  useEffect(() => {
    if (fromShortcut) {
      if (params.amount) setAmount(String(params.amount));
      if (params.merchant) setNotes(String(params.merchant));
      if (params.type === 'income') setTransactionType(1);
      else if (params.type === 'transfer') setTransactionType(2);
      // Match category by name
      if (params.category && categories.length > 0) {
        const catName = String(params.category).toLowerCase();
        const match = categories.find(c => c.name.toLowerCase().includes(catName));
        if (match) setSelectedCategory(match.category_id);
      }
      // Match payment method by name
      if (params.account && paymentMethods.length > 0) {
        const pmName = String(params.account).toLowerCase();
        const match = paymentMethods.find(p => p.name.toLowerCase().includes(pmName));
        if (match) setSelectedPaymentMethod(match.payment_id);
      }
    }
  }, [fromShortcut, params, categories, paymentMethods]);

  const handleImageOption = async (option: 'camera' | 'library') => {
    setShowImageOptions(false);
    
    if (option === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setReceiptImage(base64Image);
        // Trigger AI scan
        await scanReceiptWithAI(base64Image);
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library access is required');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setReceiptImage(base64Image);
        // Trigger AI scan
        await scanReceiptWithAI(base64Image);
      }
    }
  };

  const scanReceiptWithAI = async (base64Image: string) => {
    try {
      setIsScanning(true);
      const response = await api.post('/scan-receipt', { image: base64Image });
      const result = response.data;
      
      if (result.amount) setAmount(result.amount.toString());
      if (result.merchant) setNotes(result.merchant);
      if (result.date) {
        const parsedDate = new Date(result.date);
        if (!isNaN(parsedDate.getTime())) setDate(parsedDate);
      }
      if (result.time) {
        const [hours, minutes] = result.time.split(':');
        const newTime = new Date();
        newTime.setHours(parseInt(hours), parseInt(minutes));
        setTime(newTime);
      }
      
      Alert.alert('Receipt Scanned', 'Details have been auto-filled from your receipt.');
    } catch (error) {
      console.log('Receipt scan error:', error);
      // Silently fail - user can still manually enter
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (isLoading) return;

    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!activeProfile) {
      Alert.alert('Error', 'No active profile selected');
      return;
    }

    if (!canSubmitTransaction({ isSubmitting: isLoading, amount, hasActiveProfile: Boolean(activeProfile) })) {
      return;
    }

    setIsLoading(true);
    try {
      const types: TransactionType[] = ['expense', 'income', 'transfer'];
      const transactionData: any = {
        profile_id: activeProfile.profile_id,
        type: types[transactionType],
        amount: parseFloat(amount),
        category_id: transactionType !== 2 ? selectedCategory : undefined,
        payment_method_id: selectedPaymentMethod,
        to_payment_method_id: transactionType === 2 ? toPaymentMethod : undefined,
        description: notes || (transactionType === 0 ? 'Expense' : transactionType === 1 ? 'Income' : 'Transfer'),
        date: date.toISOString(),
        time: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`,
        receipt_image: receiptImage,
        notes: notes,
        is_pending: isPending,
        is_recurring: repeatFrequency !== 'never',
        recurring_frequency: repeatFrequency !== 'never' ? repeatFrequency : undefined,
      };

      if (editId) {
        await updateExpense(editId, transactionData);
        Alert.alert('Success', 'Transaction updated');
      } else {
        await createExpense(transactionData);
        Alert.alert('Success', 'Transaction added');
      }
      
      router.back();
    } catch (error) {
      const isEdit = Boolean(editId);
      const title = isEdit ? 'Could not update transaction' : 'Could not add transaction';
      const message = getTransactionSaveErrorMessage(error, isEdit);
      const retryable = isRetryableTransactionSaveError(error);

      if (retryable) {
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => { handleSave(); } },
        ]);
      } else {
        Alert.alert(title, message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryName = () => categories.find(c => c.category_id === selectedCategory)?.name || 'No Category';
  const getCategoryColor = () => categories.find(c => c.category_id === selectedCategory)?.color || lightTheme.colors.textTertiary;
  const getPaymentName = () => paymentMethods.find(p => p.payment_id === selectedPaymentMethod)?.name || 'Select';
  const getToPaymentName = () => paymentMethods.find(p => p.payment_id === toPaymentMethod)?.name || 'Select';
  const getRepeatLabel = () => FREQUENCY_OPTIONS.find(f => f.value === repeatFrequency)?.label || 'Never';

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={20} color={lightTheme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Item</Text>
          <TouchableOpacity 
            style={[styles.headerBtn, styles.headerBtnDone]} 
            onPress={handleSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="checkmark" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Transaction Type Selector */}
          <SegmentedControl
            options={['Expense', 'Income', 'Transfer']}
            selectedIndex={transactionType}
            onSelect={setTransactionType}
          />

          {/* Amount Card */}
          <NeumorphicCard style={styles.amountCard}>
            <Text style={styles.amountLabel}>How much?</Text>
            <View style={styles.amountRow}>
              <View style={styles.currencySelector}>
                <Text style={styles.currencySymbol}>¢</Text>
                <Text style={styles.currencyCode}>USD</Text>
                <Ionicons name="chevron-forward" size={16} color={lightTheme.colors.textTertiary} />
              </View>
              <TextInput
                style={styles.amountInput}
                value={amount ? `$${amount}` : ''}
                onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
                placeholder="$0.00"
                placeholderTextColor={lightTheme.colors.placeholder}
                keyboardType="decimal-pad"
              />
            </View>
          </NeumorphicCard>

          {/* Notes */}
          <NeumorphicCard style={styles.notesCard}>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={lightTheme.colors.placeholder}
              multiline
            />
          </NeumorphicCard>

          {/* Category (not for transfers) */}
          {transactionType !== 2 && (
            <NeumorphicCard style={styles.listCard} noPadding>
              <ListItemRow
                icon={<Ionicons name="list" size={20} color={getCategoryColor()} />}
                label={getCategoryName()}
                onPress={() => setShowCategoryModal(true)}
              />
            </NeumorphicCard>
          )}

          {/* Payment Method / Sheet */}
          <NeumorphicCard style={styles.listCard} noPadding>
            <ListItemRow
              icon={<Ionicons name="document-text-outline" size={20} color={lightTheme.colors.textTertiary} />}
              label="Sheet"
              value={getPaymentName()}
              onPress={() => setShowPaymentModal(true)}
            />
          </NeumorphicCard>

          {/* Transfer To (only for transfers) */}
          {transactionType === 2 && (
            <NeumorphicCard style={styles.listCard} noPadding>
              <ListItemRow
                icon={<Ionicons name="arrow-forward" size={20} color={lightTheme.colors.success} />}
                label="To"
                value={getToPaymentName()}
                onPress={() => setShowToPaymentModal(true)}
              />
            </NeumorphicCard>
          )}

          {/* Date & Time */}
          <NeumorphicCard style={styles.listCard} noPadding>
            <ListItemRow
              icon={<Ionicons name="calendar-outline" size={20} color={lightTheme.colors.textTertiary} />}
              label="Date"
              value={formatDate(date)}
              onPress={() => setShowDatePicker(true)}
            />
            <Divider />
            <ListItemRow
              icon={<Ionicons name="time-outline" size={20} color={lightTheme.colors.textTertiary} />}
              label="Time"
              value={formatTime(time)}
              onPress={() => setShowTimePicker(true)}
            />
          </NeumorphicCard>

          {/* Pending */}
          <NeumorphicCard style={styles.listCard} noPadding>
            <ListItemRow
              icon={<Ionicons name="hourglass-outline" size={20} color={lightTheme.colors.textTertiary} />}
              label="Pending"
              showArrow={false}
              rightElement={<ToggleSwitch value={isPending} onValueChange={setIsPending} />}
            />
          </NeumorphicCard>

          {/* Repeat */}
          <NeumorphicCard style={styles.listCard} noPadding>
            <ListItemRow
              icon={<Ionicons name="repeat" size={20} color={lightTheme.colors.textTertiary} />}
              label="Repeat"
              value={getRepeatLabel()}
              onPress={() => setShowRepeatModal(true)}
            />
          </NeumorphicCard>

          {/* Add Image */}
          {receiptImage ? (
            <View style={styles.receiptPreview}>
              <Image source={{ uri: receiptImage }} style={styles.receiptImage} />
              {isScanning && (
                <View style={styles.scanningOverlay}>
                  <ActivityIndicator size="large" color="#FFF" />
                  <Text style={styles.scanningText}>Scanning receipt...</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeReceiptBtn} onPress={() => setReceiptImage(null)}>
                <Ionicons name="close-circle" size={28} color={lightTheme.colors.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addImageBtn} onPress={() => setShowImageOptions(true)}>
              <Ionicons name="camera-outline" size={20} color={lightTheme.colors.primary} />
              <Text style={styles.addImageText}>Add Image</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Date Picker Modal */}
      <DateTimePickerModal
        visible={showDatePicker}
        mode="date"
        value={date}
        onSelect={setDate}
        onClose={() => setShowDatePicker(false)}
      />

      {/* Time Picker Modal */}
      <DateTimePickerModal
        visible={showTimePicker}
        mode="time"
        value={time}
        onSelect={setTime}
        onClose={() => setShowTimePicker(false)}
      />

      {/* Category Modal - Emoji Grid */}
      <Modal visible={showCategoryModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color={lightTheme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={modalStyles.scroll} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={catGridStyles.grid}>
                {categories.map((cat) => {
                  const emoji = getCategoryEmoji(cat.name);
                  const isSelected = selectedCategory === cat.category_id;
                  return (
                    <TouchableOpacity
                      key={cat.category_id}
                      style={catGridStyles.item}
                      onPress={() => { setSelectedCategory(cat.category_id); setShowCategoryModal(false); }}
                    >
                      <View style={[catGridStyles.emojiCircle, { backgroundColor: cat.color + '20' }, isSelected && { borderWidth: 2.5, borderColor: cat.color }]}>
                        <Text style={catGridStyles.emoji}>{emoji}</Text>
                      </View>
                      <Text style={[catGridStyles.label, isSelected && { color: cat.color, fontWeight: '600' }]} numberOfLines={1}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Add Custom Category button */}
                <TouchableOpacity style={catGridStyles.item} onPress={() => { setShowCategoryModal(false); router.push('/(tabs)/more'); }}>
                  <View style={[catGridStyles.emojiCircle, { backgroundColor: '#F0F0F4' }]}>
                    <Ionicons name="add" size={24} color="#8E8E93" />
                  </View>
                  <Text style={catGridStyles.label}>Add</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Payment Method Modal */}
      <Modal visible={showPaymentModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Select Payment Method</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color={lightTheme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={modalStyles.scroll}>
              {paymentMethods.map((pm) => (
                <TouchableOpacity
                  key={pm.payment_id}
                  style={[modalStyles.option, selectedPaymentMethod === pm.payment_id && modalStyles.optionSelected]}
                  onPress={() => { setSelectedPaymentMethod(pm.payment_id); setShowPaymentModal(false); }}
                >
                  <Ionicons name={pm.type === 'cash' ? 'cash' : 'card'} size={20} color={lightTheme.colors.primary} />
                  <Text style={modalStyles.optionText}>{pm.name}</Text>
                  {selectedPaymentMethod === pm.payment_id && (
                    <Ionicons name="checkmark" size={20} color={lightTheme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* To Payment Modal (for transfers) */}
      <Modal visible={showToPaymentModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Transfer To</Text>
              <TouchableOpacity onPress={() => setShowToPaymentModal(false)}>
                <Ionicons name="close" size={24} color={lightTheme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={modalStyles.scroll}>
              {paymentMethods.filter(pm => pm.payment_id !== selectedPaymentMethod).map((pm) => (
                <TouchableOpacity
                  key={pm.payment_id}
                  style={[modalStyles.option, toPaymentMethod === pm.payment_id && modalStyles.optionSelected]}
                  onPress={() => { setToPaymentMethod(pm.payment_id); setShowToPaymentModal(false); }}
                >
                  <Ionicons name={pm.type === 'cash' ? 'cash' : 'card'} size={20} color={lightTheme.colors.success} />
                  <Text style={modalStyles.optionText}>{pm.name}</Text>
                  {toPaymentMethod === pm.payment_id && (
                    <Ionicons name="checkmark" size={20} color={lightTheme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Repeat Modal */}
      <Modal visible={showRepeatModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Repeat</Text>
              <TouchableOpacity onPress={() => setShowRepeatModal(false)}>
                <Ionicons name="close" size={24} color={lightTheme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={modalStyles.scroll}>
              {FREQUENCY_OPTIONS.map((freq) => (
                <TouchableOpacity
                  key={freq.value}
                  style={[modalStyles.option, repeatFrequency === freq.value && modalStyles.optionSelected]}
                  onPress={() => { setRepeatFrequency(freq.value); setShowRepeatModal(false); }}
                >
                  <Text style={modalStyles.optionText}>{freq.label}</Text>
                  {repeatFrequency === freq.value && (
                    <Ionicons name="checkmark" size={20} color={lightTheme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Image Options Modal */}
      <Modal visible={showImageOptions} animationType="fade" transparent>
        <TouchableOpacity style={modalStyles.overlay} onPress={() => setShowImageOptions(false)} activeOpacity={1}>
          <View style={modalStyles.actionSheet}>
            <TouchableOpacity style={modalStyles.actionOption} onPress={() => handleImageOption('camera')}>
              <Ionicons name="camera-outline" size={24} color={lightTheme.colors.text} />
              <Text style={modalStyles.actionText}>Take Photo</Text>
            </TouchableOpacity>
            <View style={modalStyles.actionDivider} />
            <TouchableOpacity style={modalStyles.actionOption} onPress={() => handleImageOption('library')}>
              <Ionicons name="images-outline" size={24} color={lightTheme.colors.text} />
              <Text style={modalStyles.actionText}>Photo Library</Text>
            </TouchableOpacity>
            <View style={modalStyles.actionDivider} />
            <TouchableOpacity style={modalStyles.actionCancel} onPress={() => setShowImageOptions(false)}>
              <Text style={modalStyles.actionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  container: { backgroundColor: lightTheme.colors.cardBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: lightTheme.colors.divider },
  title: { fontSize: 18, fontWeight: '600', color: lightTheme.colors.text },
  scroll: { padding: 12 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, gap: 14, marginBottom: 8 },
  optionSelected: { backgroundColor: lightTheme.colors.primaryLight },
  optionText: { flex: 1, fontSize: 16, color: lightTheme.colors.text },
  categoryIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  actionSheet: { backgroundColor: lightTheme.colors.cardBackground, borderRadius: 16, margin: 16, overflow: 'hidden' },
  actionOption: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  actionText: { fontSize: 17, color: lightTheme.colors.text },
  actionDivider: { height: 1, backgroundColor: lightTheme.colors.divider },
  actionCancel: { padding: 18, alignItems: 'center', backgroundColor: lightTheme.colors.background },
  actionCancelText: { fontSize: 17, fontWeight: '600', color: lightTheme.colors.danger },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTheme.colors.background },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: lightTheme.colors.cardBackground, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  headerBtnDone: { backgroundColor: lightTheme.colors.textTertiary },
  headerTitle: { fontSize: 18, fontWeight: '700', color: lightTheme.colors.text },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
  amountCard: { marginTop: 12 },
  amountLabel: { fontSize: 14, color: lightTheme.colors.textTertiary, marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currencySelector: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currencySymbol: { fontSize: 18, color: lightTheme.colors.textTertiary },
  currencyCode: { fontSize: 16, color: lightTheme.colors.textSecondary },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '600', color: lightTheme.colors.text, textAlign: 'right' },
  notesCard: {},
  notesInput: { fontSize: 16, color: lightTheme.colors.text, minHeight: 40 },
  listCard: {},
  receiptPreview: { borderRadius: 16, overflow: 'hidden', position: 'relative' },
  receiptImage: { width: '100%', height: 200 },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  scanningText: { color: '#FFF', marginTop: 12, fontSize: 14 },
  removeReceiptBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFF', borderRadius: 14 },
  addImageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  addImageText: { fontSize: 16, fontWeight: '500', color: lightTheme.colors.primary },
});


const catGridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
    justifyContent: 'flex-start',
  },
  item: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  emojiCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  emoji: {
    fontSize: 24,
  },
  label: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    maxWidth: 70,
  },
});
