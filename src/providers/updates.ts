import type {Hass,HassEntity} from './home-assistant';
import {externalUrl} from '../config';

export interface UpdateFields {
  updateInstalledVersion?:string;
  updateLatestVersion?:string;
  updateSkippedVersion?:string;
  updateInProgress?:boolean;
  updatePercentage?:number;
  updateReleaseSummary?:string;
  updateReleaseUrl?:string;
  updateAuto?:boolean;
}
export type UpdateCommand = {type:'update_install'|'update_skip';latestVersion:string}|{type:'update_clear_skipped';skippedVersion:string};
export type UpdateCapability = UpdateCommand['type'];
const updateId=(id:string)=>/^update\.[a-z0-9_]+$/.test(id);
const version=(raw:unknown)=>typeof raw==='string'&&raw.trim()?raw:undefined;
const percentage=(raw:unknown):raw is number=>typeof raw==='number'&&Number.isFinite(raw)&&raw>=0&&raw<=100;

/** Verified official HA update contracts at 2024.6.4 and 2026.9.4.
 * INSTALL=1 and PROGRESS=4; skip services are not install-feature gated.
 * Legacy numeric in_progress (including zero) means an active installation.
 */
export function mapUpdate(raw:HassEntity|undefined):UpdateFields&{capabilities:UpdateCapability[]}{
  if(!raw||!updateId(raw.entity_id))return {capabilities:[]};
  const a=raw.attributes;
  const features=typeof a.supported_features==='number'&&Number.isInteger(a.supported_features)&&a.supported_features>=0?a.supported_features:0;
  const installed=version(a.installed_version),latest=version(a.latest_version),skipped=version(a.skipped_version);
  const legacyProgress=(features&4)!==0&&percentage(a.in_progress);
  const busy=typeof a.in_progress==='boolean'?a.in_progress:legacyProgress?true:undefined;
  const progress=busy&&features&4?(percentage(a.update_percentage)?a.update_percentage:legacyProgress?a.in_progress as number:undefined):undefined;
  const auto=typeof a.auto_update==='boolean'?a.auto_update:undefined;
  const available=raw.state==='on'||raw.state==='off';
  const offered=!!installed&&!!latest&&installed!==latest&&(raw.state==='on'||skipped===latest);
  const capabilities:UpdateCapability[]=[];
  if(available&&busy===false){
    if(offered&&features&1)capabilities.push('update_install');
    if(auto===false&&offered&&skipped!==latest)capabilities.push('update_skip');
    if(auto===false&&skipped)capabilities.push('update_clear_skipped');
  }
  return {capabilities,updateInstalledVersion:installed,updateLatestVersion:latest,updateSkippedVersion:skipped,updateInProgress:busy,updatePercentage:progress,
    updateAuto:auto,updateReleaseSummary:typeof a.release_summary==='string'?a.release_summary:undefined,
    updateReleaseUrl:externalUrl(a.release_url)?a.release_url:undefined};
}

/** Resolve the exact current owner and version after UI confirmation, before dispatch. */
export function prepareUpdateCommand(hass:Pick<Hass,'states'>,id:string,command:UpdateCommand){
  const raw=hass.states[id];
  if(!updateId(id)||!raw||raw.entity_id!==id||!['on','off'].includes(raw.state))throw new Error('The owning update entity is unavailable.');
  const current=mapUpdate(raw);
  if(!current.capabilities.includes(command.type))throw new Error('This update action is not supported or an installation is already running.');
  if(command.type==='update_install'||command.type==='update_skip'){
    if(typeof command.latestVersion!=='string'||command.latestVersion!==current.updateLatestVersion)throw new Error('The offered update changed. Review the latest version before continuing.');
  }else if(command.type==='update_clear_skipped'){
    if(typeof command.skippedVersion!=='string'||command.skippedVersion!==current.updateSkippedVersion)throw new Error('The skipped update changed. Review it before continuing.');
  }else throw new Error('This update action is not supported.');
  return {domain:'update',service:command.type==='update_install'?'install':command.type==='update_skip'?'skip':'clear_skipped',data:{},target:{entity_id:id}};
}
