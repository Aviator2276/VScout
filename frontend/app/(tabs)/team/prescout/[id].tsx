import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, ActivityIndicator } from 'react-native';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Card } from '@/components/ui/card';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';
import { Input, InputField } from '@/components/ui/input';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectInput,
  SelectPortal,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicatorWrapper,
  SelectDragIndicator,
  SelectItem,
} from '@/components/ui/select';
import {
  Checkbox,
  CheckboxIndicator,
  CheckboxIcon,
  CheckboxLabel,
} from '@/components/ui/checkbox';
import { getTeamName, updateTeamPrescout } from '@/api/teams';
import { db } from '@/utils/db';
import { PrescoutRecord } from '@/types/record';
import { CheckIcon } from 'lucide-react-native';
import { TeamPictureCamera } from '@/components/TeamPictureCamera';
import { useApp } from '@/contexts/AppContext';
import { Image } from '@/components/ui/image';
import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

export default function PrescoutFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { competitionCode } = useApp();
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state - template placeholders
  const [drivetrain, setDrivetrain] = useState<string>('');
  const [intake, setIntake] = useState<string>('');
  const [hopper, setHopper] = useState<string>('');
  const [driverExperience, setDriverExperience] = useState<string>('');
  const [range, setRange] = useState<string>('');
  const [turret, setTurret] = useState(false);
  const [hood, setHood] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [showCameraView, setShowCameraView] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [showValidationAlert, setShowValidationAlert] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    // Reset form state when team ID changes
    setDrivetrain('');
    setIntake('');
    setHopper('');
    setDriverExperience('');
    setRange('');
    setTurret(false);
    setHood(false);
    setNotes('');
    setUri(null);
    loadTeamName();
  }, [id]);

  async function loadTeamName() {
    try {
      setLoading(true);
      const teamNumber = parseInt(id || '0', 10);
      if (teamNumber) {
        const name = await getTeamName(teamNumber);
        setTeamName(name);
      }
    } catch (err) {
      console.error('Failed to load team name:', err);
    } finally {
      setLoading(false);
    }
  }

  function validateForm(): string | null {
    if (!drivetrain.trim()) return 'Drivetrain type is required';
    if (!intake.trim()) return 'Intake type is required';
    if (!hopper.trim()) return 'Hopper size is required';
    if (!driverExperience.trim()) return 'Driver experience is required';
    if (!range.trim()) return 'Range is required';
    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setValidationMessage(validationError);
      setShowValidationAlert(true);
      return;
    }

    setSubmitting(true);
    try {
      const teamNumber = parseInt(id || '0', 10);
      const prescoutData = {
        prescout_drivetrain: drivetrain,
        prescout_hopper_size: parseInt(hopper, 10) || 0,
        prescout_intake_type: intake,
        prescout_rotate_yaw: turret,
        prescout_rotate_pitch: hood,
        prescout_range: range,
        prescout_additional_comments: notes,
        picture: uri || '',
      };

      // Store to local IndexedDB
      await updateTeamPrescout(teamNumber, prescoutData);

      // Store to PrescoutRecords for staging/upload
      const now = Date.now();
      const prescoutRecord: PrescoutRecord = {
        info: {
          status: 'pending',
          competitionCode: competitionCode || '',
          created_at: now,
          last_retry: now,
          archived: false,
        },
        team: {
          number: teamNumber,
          name: teamName || '',
          competitionCode: competitionCode || '',
        },
        prescout_drivetrain: drivetrain,
        prescout_hopper_size: parseInt(hopper, 10) || 0,
        prescout_intake_type: intake,
        prescout_rotate_yaw: turret,
        prescout_rotate_pitch: hood,
        prescout_driver_years: parseInt(driverExperience),
        prescout_range: range,
        prescout_additional_comments: notes,
      };
      await db.prescoutRecords.put(prescoutRecord);

      router.replace(`/(tabs)/team/${id}`);
    } catch (error) {
      console.error('Failed to save prescout data:', error);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AdaptiveSafeArea>
        <Center className='flex-1'>
          <ActivityIndicator size='large' />
        </Center>
      </AdaptiveSafeArea>
    );
  }

  return (
    <AdaptiveSafeArea>
      <TeamPictureCamera
        isOpen={showCameraView}
        onClose={() => setShowCameraView(false)}
        onCapture={(capturedUri: string) => setUri(capturedUri)}
        teamNumber={parseInt(id || '0', 10)}
        teamName={teamName || ''}
        competitionCode={competitionCode || ''}
      />
      <Box className='max-w-2xl self-center w-full'>
        <Header
          title={`Prescout ${id}`}
          isMainScreen={false}
          showBackButton
          fallbackRoute={`/(tabs)/team/${id}`}
        />
        <ScrollView className='flex-1 px-4 pb-4'>
          <VStack space='lg' className='pb-8'>
            {/* Team Header */}
            {uri && (
              <Card
                variant='outline'
                size='md'
                className='aspect-square object-cover max-w-full'
              >
                <Image source={{ uri }} size='full' />
              </Card>
            )}
            <Card variant='outline' size='md'>
              <VStack space='xs'>
                <Heading size='xl'>Team {id}</Heading>
                {teamName && (
                  <Text className='text-typography-600'>{teamName}</Text>
                )}
              </VStack>
            </Card>

            <Button
              size='lg'
              action='primary'
              onPress={() => setShowCameraView(true)}
            >
              <ButtonText>Take Picture</ButtonText>
            </Button>

            {/* Robot Specifications */}
            <Card variant='outline' size='md'>
              <VStack space='md'>
                <Heading size='md'>Robot Specifications</Heading>

                {/* Drivetrain */}
                <VStack space='xs'>
                  <Text className='font-medium'>Drivetrain Type</Text>
                  <Select
                    selectedValue={drivetrain}
                    onValueChange={setDrivetrain}
                  >
                    <SelectTrigger>
                      <SelectInput placeholder='Select drivetrain' />
                    </SelectTrigger>
                    <SelectPortal>
                      <SelectBackdrop />
                      <SelectContent>
                        <SelectDragIndicatorWrapper>
                          <SelectDragIndicator />
                        </SelectDragIndicatorWrapper>
                        <SelectItem label='Swerve' value='swerve' />
                        <SelectItem label='Tank' value='tank' />
                        <SelectItem label='Mecanum' value='mecanum' />
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                </VStack>
                <VStack space='xs'>
                  <Text className='font-medium'>Intake Type</Text>
                  <Select selectedValue={intake} onValueChange={setIntake}>
                    <SelectTrigger>
                      <SelectInput placeholder='Select intake type' />
                    </SelectTrigger>
                    <SelectPortal>
                      <SelectBackdrop />
                      <SelectContent>
                        <SelectDragIndicatorWrapper>
                          <SelectDragIndicator />
                        </SelectDragIndicatorWrapper>
                        <SelectItem label='Inbumper' value='inbumper' />
                        <SelectItem label='Overbumper' value='overbumper' />
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                </VStack>

                {/* Hopper Size */}
                <VStack space='xs'>
                  <Text className='font-medium'>Hopper Size</Text>
                  <Input>
                    <InputField
                      placeholder='0'
                      value={hopper}
                      onChangeText={setHopper}
                      keyboardType='numeric'
                    />
                  </Input>
                </VStack>
                <VStack space='xs'>
                  <Text className='font-medium'>
                    Primary Driver Experience (Years)
                  </Text>
                  <Input>
                    <InputField
                      placeholder='0'
                      value={driverExperience}
                      onChangeText={setDriverExperience}
                      keyboardType='numeric'
                    />
                  </Input>
                </VStack>
              </VStack>
            </Card>

            {/* Shooter Rotation */}
            <Card variant='outline' size='md'>
              <VStack space='md'>
                <Heading size='md'>Shooter Specifications</Heading>
                <VStack space='xs'>
                  <Text className='font-medium'>Shooter Range</Text>
                  <Select selectedValue={range} onValueChange={setRange}>
                    <SelectTrigger>
                      <SelectInput placeholder='Select shooter range' />
                    </SelectTrigger>
                    <SelectPortal>
                      <SelectBackdrop />
                      <SelectContent>
                        <SelectDragIndicatorWrapper>
                          <SelectDragIndicator />
                        </SelectDragIndicatorWrapper>
                        <SelectItem
                          label='Alliance Zone Only'
                          value='alliance'
                        />
                        <SelectItem
                          label='Neutral to Alliance Zone'
                          value='neutral'
                        />
                        <SelectItem
                          label='Opponent to Alliance Zone'
                          value='opponent'
                        />
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                </VStack>
                <HStack space='md' className='w-full'>
                  <VStack space='xs' className='flex-1'>
                    <Text className='font-medium'>Shooter Rotation</Text>
                    <Checkbox
                      value='turret'
                      isChecked={turret}
                      onChange={setTurret}
                    >
                      <CheckboxIndicator>
                        <CheckboxIcon as={CheckIcon} />
                      </CheckboxIndicator>
                      <CheckboxLabel>Turret Rotation</CheckboxLabel>
                    </Checkbox>

                    <Checkbox value='hood' isChecked={hood} onChange={setHood}>
                      <CheckboxIndicator>
                        <CheckboxIcon as={CheckIcon} />
                      </CheckboxIndicator>
                      <CheckboxLabel>Hood Rotation</CheckboxLabel>
                    </Checkbox>
                  </VStack>
                </HStack>
              </VStack>
            </Card>
            {/* Notes */}
            <Card variant='outline' size='md'>
              <VStack space='md'>
                <Heading size='md'>Additional Notes</Heading>
                <Textarea>
                  <TextareaInput
                    placeholder='Enter any additional observations...'
                    value={notes}
                    onChangeText={setNotes}
                  />
                </Textarea>
              </VStack>
            </Card>

            <Button
              size='lg'
              action='primary'
              onPress={handleSubmit}
              isDisabled={submitting}
            >
              <ButtonText>
                {submitting ? 'Saving Locally...' : 'Save Prescout'}
              </ButtonText>
            </Button>
          </VStack>
        </ScrollView>
      </Box>

      <AlertDialog
        isOpen={showValidationAlert}
        onClose={() => setShowValidationAlert(false)}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size='lg'>Empty Value</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>{validationMessage}</Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button onPress={() => setShowValidationAlert(false)}>
              <ButtonText>OK</ButtonText>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdaptiveSafeArea>
  );
}
