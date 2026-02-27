/********************************************************
 * 
 * Author:              William Mills
 *                    	Technical Solutions Specialist 
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 * 
 * 
 * Version: 1-1-0
 * Released: 02/27/26
 * 
 * Example macro for controlling individual mics inputs
 * on Cisco Collab Devices
 * 
 * Full Readme and source code available on Github:
 * https://github.com/wxsd-sales/mic-controller-macro
 * 
 ********************************************************/

import xapi from 'xapi';

/*********************************************************
 * Configure the settings below
**********************************************************/


const config = {
  button: {
    name: 'Mic Controls',     // Name of the Button and Panel Page
    icon: 'Microphone',       // One of the supported native icons name
    location: 'CallControls'  // Location of the Panel Button
  },
  audioInputs: {
    Microphone: [1, 2],       
    Ethernet: [1.1, 2.3, 3],
    USBMicrophone: [1],
  },
  panelId: 'micController'  // PanelId is used for the base panel and widget Ids
}

/*********************************************************
 * Main function to setup and add event listeners
**********************************************************/

let gainLevel = 'Gain';

init();

async function init() {
  gainLevel = await checkGainLevel();
  await createPanel();
  syncUI();
  xapi.Config.Audio.Input.on(processMicChange);
  xapi.Event.UserInterface.Extensions.Widget.Action.on(processWidgetAction);
}


async function checkGainLevel() {
  const inputs = await xapi.Config.Audio.Input.get();
  const { Ethernet, Microphone, USBMicrophone } = inputs;
  if (Ethernet) return typeof Ethernet?.[0]?.Channel?.[0].Gain != 'undefined' ? 'Gain' : 'Level'
  if (Microphone) return Microphone.some(mic => typeof mic?.Gain != 'undefined') ? 'Gain' : 'Level'
  if (USBMicrophone) return typeof USBMicrophone?.[0]?.Gain != 'undefined' ? 'Gain' : 'Level'
}

function processWidgetAction({ WidgetId, Type, Value, Origin, PeripheralId }) {
  if (Type != 'released') return
  if (!WidgetId.startsWith(config.panelId)) return
  const [_panelId, type, micType, micNum, subId] = WidgetId.split('-');
  if (type == 'gain') return setMicGain(micType, micNum, subId, Value);
  if (type == 'mute') return toggleMicMode(micType, micNum, subId);
}


function processMicChange(inputChange) {
  console.debug('inputChange:', inputChange)
  const micType = Object.keys(inputChange)?.[0];
  const audioInputs = config.audioInputs;
  if (typeof audioInputs?.[micType] == 'undefined') return
  const { Mode, Gain, Level, Channel, id } = inputChange[micType]?.[0];
  const { widgetSuffix } = convertMicId(micType, `${id}`);
  const newLevel = Gain ?? Level;
  if (typeof newLevel != 'undefined') setSliderWidget(micType, widgetSuffix, Level)
  if (typeof Mode != 'undefined') setMuteWidget(widgetSuffix, Mode == 'Off')
  if (typeof Channel != 'undefined') {
    const subId = Channel?.[0]?.id;
    if (typeof subId == 'undefined') return
    const { Mode, Gain, Level } = Channel?.[0];
    const newLevel = Gain ?? Level;
    const { widgetSuffix } = convertMicId(micType, `${id}.${subId}`);
    if (typeof newLevel != 'undefined') setSliderWidget(micType, widgetSuffix, newLevel)
    if (typeof Mode != 'undefined') setMuteWidget(widgetSuffix, Mode == 'Off')
  }
}


function convertMicId(micType, id) {
  if (micType != 'Ethernet') return { id, widgetSuffix: `${micType}-${id}` }
  const [micNum, subId] = (id + "").split(".");
  if (typeof subId == 'undefined') return { id: micNum, subId: 1, widgetSuffix: `${micType}-${micNum}-1` }
  return { id: micNum, subId, widgetSuffix: `${micType}-${micNum}-${subId}` }
}

async function syncUI() {
  const inputs = await xapi.Config.Audio.Input.get();
  const audioInputs = config.audioInputs;
  const micTypes = Object.keys(audioInputs);
  micTypes.map(micType => audioInputs[micType].map(id => updateUI(micType, id, inputs)));
}

function getAudioValue(inputs, value, micType, id, subId) {
  const match = inputs?.[micType].find(mic => mic.id == id)
  if (micType != 'Ethernet' || typeof subId == 'undefined') return match?.[value]
  const matchChannel = match?.Channel?.find(channel => channel.id == subId)
  return matchChannel?.[value]
}

function updateUI(micType, micId, inputs) {
  console.log('Updating UI - micType:', micType, 'micId', micId)
  const { id, subId, widgetSuffix } = convertMicId(micType, micId);
  console.log('Convered - id:', id, '-subId:', subId);
  const gain = getAudioValue(inputs, gainLevel, micType, id, subId);
  const mode = getAudioValue(inputs, 'Mode', micType, id, subId);
  if (typeof gain != 'undefined') setSliderWidget(micType, widgetSuffix, gain);
  if (typeof mode != 'undefined') setMuteWidget(widgetSuffix, mode == 'Off');
}


function setSliderWidget(micType, widgetSuffix, value) {
  if (typeof value == 'undefined') return
  const WidgetId = `${config.panelId}-gain-${widgetSuffix}`;
  const max = micType == 'USBMicrophone' || (micType == 'Microphone' && gainLevel == 'Gain') ? 24 : 70;
  const mappedValue = Math.round(((value / max)) * 255)
  console.log('Setting WidgetId:', WidgetId, 'Slider Value:', mappedValue, '- Mapped From Value:', value, 'Max:', max);
  xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: mappedValue, WidgetId });
}


function setMuteWidget(widgetSuffix, active) {
  const WidgetId = `${config.panelId}-mute-${widgetSuffix}`;
  if (active) {
    console.log('SetValue WidgetId:', WidgetId, 'as active');
    xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: 'active', WidgetId });
  } else {
    console.log('UnsetValue WidgetId:', WidgetId);
    xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId });
  }
}

function setMicGain(micType, micNum, subId, value) {
  const max = micType == 'USBMicrophone' || (micType == 'Microphone' && gainLevel == 'Gain') ? 24 : 70;
  const mappedValue = Math.round((value / 255) * max);
  const hasSubId = typeof subId != 'undefined';
  const subText = hasSubId ? `.${subId}` : '';
  console.log(`Setting ${micType} ${micNum}${subText} ${gainLevel}: ${mappedValue}`)
  if (hasSubId) {
    xapi.Config.Audio.Input[micType][micNum].Channel[subId][gainLevel].set(mappedValue);
  } else {
    xapi.Config.Audio.Input[micType][micNum][gainLevel].set(mappedValue);
  }
}

async function toggleMicMode(micType, micNum, subId) {
  const inputs = await xapi.Config.Audio.Input.get();
  const mode = getAudioValue(inputs, 'Mode', micType, micNum, subId);
  const newMode = mode == 'On' ? 'Off' : 'On'

  if (micType == 'Ethernet') {
    if (typeof subId != 'undefined') {
      console.log(`Setting ${micType} Id: ${micNum} SubId: ${subId} Mode: ${newMode}`);
      xapi.Config.Audio.Input[micType][micNum].Channel[subId].Mode.set(newMode).then(result => console.log('result', result))
    } else {
      console.log(`Setting ${micType} ${micNum} Mode: ${newMode}`);
      xapi.Config.Audio.Input[micType][micNum].Mode.set(newMode);
    }
  } else {
    console.log(`Setting ${micType} ${micNum} Mode: ${newMode}`);
    xapi.Config.Audio.Input[micType][micNum].Mode.set(newMode);
  }

}

function createMicRow(micType, micId, inputs) {
  const panelId = config.panelId;
  const { id, subId, widgetSuffix } = convertMicId(micType, micId);
  const gain = getAudioValue(inputs, gainLevel, micType, id, subId);
  const mode = getAudioValue(inputs, 'Mode', micType, id, subId);
  const hasGain = typeof gain != 'undefined';
  const hasMode = typeof mode != 'undefined';

  // Don't include rows for connectors that have no gain/level and mute controls
  if (!(hasGain || hasMode)) return ''

  const slider = hasGain ?
    `<Widget>
      <WidgetId>${panelId}-gain-${widgetSuffix}</WidgetId>
      <Type>Slider</Type>
      <Options>size=3</Options>
    </Widget>` :
    `<Widget>
        <WidgetId>${panelId}-gainText-${widgetSuffix}</WidgetId>
        <Name>${gainLevel} Not Available For This Input</Name>
        <Type>Text</Type>
        <Options>size=3;align=center</Options>
    </Widget>`

  const mute = hasMode ?
    `<Widget>
        <WidgetId>${panelId}-mute-${widgetSuffix}</WidgetId>
        <Type>Button</Type>
        <Options>size=1;icon=mic_muted</Options>
    </Widget>` :
    `<Widget>
        <WidgetId>${panelId}-modeText-${widgetSuffix}</WidgetId>
        <Name>Mute Not Supported</Name>
        <Type>Text</Type>
        <Options>size=1;align=center;fontSize=small</Options>
    </Widget>`;

  return `<Row>
            <Name>${micType} ${id}${subId ? '.'+subId : ''}</Name>
            ${slider}
            ${mute}
          </Row>`
}


async function createPanel() {
  const order = await panelOrder(config.panelId);
  const panelId = config.panelId;
  const button = config.button;
  const {icon, name, location} = button
  const audioInputs = config.audioInputs;
  const inputs = await xapi.Config.Audio.Input.get();
  const micTypes = Object.keys(audioInputs);
  const rows = micTypes.map(micType => audioInputs[micType].map(id => createMicRow(micType, id, inputs)));

  const mtrDevice = await xapi.Command.MicrosoftTeams.List({ Show: 'Installed' })
    .then(() => true)
    .catch(() => false)

  const panelLocation = mtrDevice && location == 'Hidden' ? 'ControlPanel' : location;

  const panel = `
  <Extensions>
    <Panel>
      <Location>${panelLocation}</Location>
      <Icon>${icon}</Icon>
      <Name>${name}</Name>
      <ActivityType>Custom</ActivityType>
      ${order}
      <Page>
        <Name>${name}</Name>
        ${rows}
      </Page>
    </Panel>
  </Extensions>`;

  return xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panel)
}

/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({ ActivityType: "Custom" });
  const panels = list?.Extensions?.Panel
  if (!panels) return ''
  const existingPanel = panels.find(panel => panel.PanelId == panelId)
  if (!existingPanel) return ''
  return `<Order>${existingPanel.Order}</Order>`
}
