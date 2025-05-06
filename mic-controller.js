/********************************************************
 * 
 * Author:              William Mills
 *                    	Technical Solutions Specialist 
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 * 
 * 
 * Version: 1-0-0
 * Released: 05/01/25
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
    name: 'Mic Controls',   // Name of the Button and Panel Page
    icon: 'Microphone'      // One of the supported native icons name
  },
  mics: [1, 2, 3, 4],       // Mics which you wish to control
  panelId: 'micController'  // PanelId is used for the base panel and widget Ids
}

/*********************************************************
 * Main function to setup and add event listeners
**********************************************************/

let gainLevel = 'Gain';
let max = 70;

init();

async function init() {
  gainLevel = await checkGainLevel();
  max = (gainLevel == 'Gain') ? 24 : 70;
  await createPanel();
  syncUI();
  xapi.Config.Audio.Input.Microphone.on(processMicChange);
  xapi.Event.UserInterface.Extensions.Widget.Action.on(processWidgetAction);
}


async function checkGainLevel() {
  const { Level, Gain } = await xapi.Config.Audio.Input.Microphone[1].get();
  console.log(Level, Gain)
  if (Level) return 'Level'
  if (Gain) return 'Gain'

}

function processWidgetAction({ WidgetId, Type, Value }) {
  if (Type != 'released') return
  if (!WidgetId.startsWith(config.panelId)) return
  const [_widgitId, type, micNum] = WidgetId.split('-');
  if (type == 'gain') return setMicGain(micNum, Value);
  if (type == 'mute') return toggleMicMode(micNum);
}


function processMicChange({ Level, Mode, id }) {
  if (!config.mics.includes(parseInt(id))) return
  if (Level) return setSliderWidget(id, Level)
  if (Mode) return setMuteWidget(id, Mode == 'Off')
}

async function syncUI() {
  const mics = await xapi.Config.Audio.Input.Microphone.get();
  const controlledMics = mics.filter(m => config.mics.includes(parseInt(m.id)))
  console.log(controlledMics)
  controlledMics.forEach(m => setSliderWidget(m.id, m.Level ?? m.Gain));
  controlledMics.forEach(m => setMuteWidget(m.id, m.Mode == 'Off'))
}


function setSliderWidget(micNum, value) {
  const mappedValue = Math.round((value / max) * 255)
  console.log('Setting Mic Slider:', micNum, 'Value:', value, 'MappedValue', mappedValue)
  const panelId = config.panelId;
  xapi.Command.UserInterface.Extensions.Widget.SetValue(
    { Value: mappedValue, WidgetId: `${panelId}-gain-${micNum}` });
}


function setMuteWidget(micNum, active) {
  const WidgetId = `${config.panelId}-mute-${micNum}`
  console.log('Setting Mic :', micNum, 'Mute: ', active)
  if (active) {
    xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: 'active', WidgetId });
  } else {
    xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId });
  }
}

function setMicGain(micNum, value) {
  const mappedValue = Math.round((value / 255) * max);
  console.log('Setting Mic:', micNum, 'Slider Value:', value, 'Mapped:', mappedValue, 'Type', gainLevel)
  xapi.Config.Audio.Input.Microphone[micNum][gainLevel].set(mappedValue);
}

async function toggleMicMode(micNum) {
  const currentMode = await xapi.Config.Audio.Input.Microphone[micNum].Mode.get();
  const newMode = currentMode == 'On' ? 'Off' : 'On'
  console.log('Setting Mic:', micNum, 'Mode:', newMode)
  xapi.Config.Audio.Input.Microphone[micNum].Mode.set(newMode);
}

function createMicRow(micNum) {
  const panelId = config.panelId;
  return `<Row>
            <Name>Mic ${micNum}</Name>
            <Widget>
              <WidgetId>${panelId}-gain-${micNum}</WidgetId>
              <Type>Slider</Type>
              <Options>size=3</Options>
            </Widget>
            <Widget>
              <WidgetId>${panelId}-mute-${micNum}</WidgetId>
              <Type>Button</Type>
              <Options>size=1;icon=mic_muted</Options>
            </Widget>
          </Row>`
}


async function createPanel() {

  const order = await panelOrder(config.panelId);
  const panelId = config.panelId;
  const button = config.button;
  const rows = config.mics.map(createMicRow)


  const mtrDevice = await xapi.Command.MicrosoftTeams.List({ Show: 'Installed' })
    .then(() => true)
    .catch(() => false)

  const location = mtrDevice ? 'ControlPanel' : 'HomeScreenAndCallControls'

  const panel = `
  <Extensions>
    <Panel>
      <Location>${location}</Location>
      <Icon>${button.icon}</Icon>
      <Name>${button.name}</Name>
      <ActivityType>Custom</ActivityType>
      ${order}
      <Page>
        <Name>${button.name}</Name>
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
