import React from 'react'
import { Modal, Text, Button, Stack } from '@mantine/core';

interface CreateSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenName?: string;
  tokenSymbol?: string;
}

function CreateSuccessModal({ isOpen, onClose, tokenName, tokenSymbol }: CreateSuccessModalProps) {
  return (
    <Modal opened={isOpen} onClose={onClose} title="Token Created" centered>
      <Stack gap="md">
        <Text ta="center" size="lg" fw={700}>
          Congratulations!
        </Text>
        <Text ta="center">
          Your token {tokenName} ({tokenSymbol}) has been created successfully.
        </Text>
        <Text ta="center" size="sm" c="dimmed">
          You can now manage your token in the dashboard.
        </Text>
        <Button fullWidth onClick={onClose}>
          Close
        </Button>
      </Stack>
    </Modal>
  );
}

export default CreateSuccessModal;
