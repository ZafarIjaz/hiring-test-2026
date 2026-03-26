import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useClinic } from '@/hooks/useClinic';
import { useSubscription } from '@/hooks/useSubscription';
import { getClinicMembers } from '@/services/firestore';
import { SeatUsageBar } from '@/components/SeatUsageBar';
import { inviteStaffMember, removeStaffMember } from '@/services/auth';
import type { User } from '@/types/user';

export default function StaffScreen() {
  const { isOwner } = useAuth();
  const { clinic } = useClinic();
  const { seatsUsed, seatsMax, canAddStaff, isGracePeriod } = useSubscription();
  const [members, setMembers] = useState<User[]>([]);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  useEffect(() => {
    if (!clinic) return;
    getClinicMembers(clinic.id).then((all) =>
      setMembers(all.filter((u) => u.role === 'staff' || u.role === 'owner')),
    );
  }, [clinic?.id]);

  async function submitInvite() {
    if (!clinic) return;
    if (!inviteName.trim() || !inviteEmail.trim()) {
      Alert.alert('Missing fields', 'Enter both name and email.');
      return;
    }
    try {
      const { resetLink } = await inviteStaffMember({
        clinicId: clinic.id,
        displayName: inviteName.trim(),
        email: inviteEmail.trim(),
      });
      setInviteVisible(false);
      setInviteName('');
      setInviteEmail('');
      Alert.alert('Invite created', `Share this reset link with the staff member:\n\n${resetLink}`);
      const all = await getClinicMembers(clinic.id);
      setMembers(all.filter((u) => u.role === 'staff' || u.role === 'owner'));
    } catch (err) {
      Alert.alert('Invite failed', (err as Error).message);
    }
  }

  function handleInviteStaff() {
    if (!canAddStaff) {
      if (isGracePeriod) {
        Alert.alert('Billing issue', 'Your plan has a payment issue. Resolve billing before adding staff.');
      } else {
        Alert.alert('Seat limit reached', 'Upgrade your plan or purchase the Extra Seats add-on to add more staff.');
      }
      return;
    }
    setInviteVisible(true);
  }

  function handleRemoveStaff(user: User) {
    Alert.alert(
      'Remove staff member',
      `Remove ${user.displayName} from the clinic? Their active session will also be invalidated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (!clinic) return;
            removeStaffMember({
              clinicId: clinic.id,
              targetUserId: user.id,
            })
              .then(async () => {
                const all = await getClinicMembers(clinic.id);
                setMembers(all.filter((u) => u.role === 'staff' || u.role === 'owner'));
              })
              .catch((err) => Alert.alert('Removal failed', (err as Error).message));
          },
        },
      ],
    );
  }

  function renderMember({ item }: { item: User }) {
    const isCurrentUserOwner = item.role === 'owner';
    return (
      <View style={styles.memberRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.displayName}</Text>
          <Text style={styles.memberEmail}>{item.email}</Text>
        </View>
        <View style={styles.memberRight}>
          <View style={[styles.roleBadge, isCurrentUserOwner && styles.roleBadgeOwner]}>
            <Text style={[styles.roleText, isCurrentUserOwner && styles.roleTextOwner]}>
              {item.role}
            </Text>
          </View>
          {isOwner && !isCurrentUserOwner && (
            <TouchableOpacity onPress={() => handleRemoveStaff(item)}>
              <Text style={styles.removeButton}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Modal visible={inviteVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Invite staff member</Text>
            <TextInput
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="Full name"
              style={styles.input}
            />
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setInviteVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitInvite}>
                <Text style={styles.modalSubmit}>Send invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <SeatUsageBar used={seatsUsed} max={seatsMax} />
        {isOwner && (
          <TouchableOpacity
            style={[styles.inviteButton, !canAddStaff && styles.inviteButtonDisabled]}
            onPress={handleInviteStaff}
          >
            <Text style={styles.inviteText}>+ Invite staff</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={members}
        keyExtractor={(item: User) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No staff members yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  inviteButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  inviteButtonDisabled: { backgroundColor: '#9ca3af' },
  inviteText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, gap: 8 },
  memberRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#1e40af' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  memberEmail: { fontSize: 13, color: '#6b7280' },
  memberRight: { alignItems: 'flex-end', gap: 6 },
  roleBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleBadgeOwner: { backgroundColor: '#fef3c7' },
  roleText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  roleTextOwner: { color: '#92400e' },
  removeButton: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 32 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 4 },
  modalCancel: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  modalSubmit: { fontSize: 14, color: '#2563eb', fontWeight: '700' },
});
