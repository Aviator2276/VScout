import React, { useEffect, useRef, useState } from 'react';
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
import { getTeamName } from '@/api/teams';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
  ActionsheetItem,
  ActionsheetItemText,
} from '@/components/ui/actionsheet';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Spinner } from '@/components/ui/spinner';
import { Camera, CheckIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from '@/components/ui/slider';

export default function PrescoutFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
  const [showCameraView, setShowCameraView] = React.useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
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

  async function handleSubmit() {
    setSubmitting(true);
    console.log('Submitting prescout data:', {
      teamNumber: id,
      drivetrain,
      intake,
      range,
      turret,
      hood,
      notes,
    });
    setTimeout(() => {
      setSubmitting(false);
      router.back();
    }, 1000);
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

  const handleClose = () => setShowCameraView(false);

  const takePicture = async () => {
    const photo = await ref.current?.takePictureAsync();
    if (photo?.uri) setUri(photo.uri);
    handleClose();
  };

  return (
    <AdaptiveSafeArea>
      <Actionsheet isOpen={showCameraView} onClose={handleClose}>
        <ActionsheetBackdrop />
        <ActionsheetContent className='w-full h-[calc(100%-4rem)]'>
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator />
          </ActionsheetDragIndicatorWrapper>
          {!permission?.granted ? (
            <Center className='flex-1 max-w-2xl self-center w-full p-4'>
              <VStack space='md'>
                <Text>We need your permission to show the camera</Text>
                <Button onPress={requestPermission}>
                  <ButtonText>Grant Permission</ButtonText>
                </Button>
              </VStack>
            </Center>
          ) : !permission ? (
            <Center className='flex-1 max-w-2xl self-center w-full p-4'>
              <VStack space='md'>
                <Spinner />
              </VStack>
            </Center>
          ) : (
            <CameraView
              ref={ref}
              style={{
                width: '100%',
                height: 500,
                marginTop: 8,
                borderRadius: 10,
              }}
              facing={'back'}
              mirror={false}
            />
          )}
          <Button
            size='lg'
            action='primary'
            onPress={takePicture}
            className='w-full mb-4 mt-4'
          >
            <Icon
              as={Camera}
              className='color-slate-100 dark:color-slate-900'
            />
          </Button>

          <Button
            size='lg'
            action='negative'
            className='w-full mb-4'
            onPress={handleClose}
          >
            <ButtonText>Cancel</ButtonText>
          </Button>
        </ActionsheetContent>
      </Actionsheet>
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
    </AdaptiveSafeArea>
  );
}
