import {SEASON_INFO} from '../data/economy.ts';
import {getWeatherVaneOutlook,type WeatherVaneState} from '../engine/weatherVane.ts';
export default function WeatherVaneOutlook({state}:{state:WeatherVaneState}) {
 const outlook=getWeatherVaneOutlook(state);if(!outlook)return null;
 return <section aria-labelledby="weather-vane-heading" className="rounded-lg p-3 mb-3 text-sm" style={{backgroundColor:'#231e16',border:'1px solid #8a7a3a',color:'#e8dcc8'}}>
  <h3 id="weather-vane-heading" className="text-base font-bold mb-2" style={{fontFamily:'Cinzel, serif',color:'#e8c44a'}}>Weather Vane outlook</h3>
  {outlook.kind==='final'?<p>This is the final season of your reign. There is no next-season forecast.</p>:<>
   <p className="font-semibold mb-2">Next: {SEASON_INFO[outlook.season].label}, turn {outlook.turn}/40</p>
   <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
    <dt>Seasonal farm factor</dt><dd>×{outlook.farmMultiplier}</dd>
    <dt>Potential farm food</dt><dd>{outlook.farmFood}</dd>
    <dt>Food requirement</dt><dd>{outlook.foodNeed}</dd>
    <dt>Seasonal wear factor</dt><dd>×{outlook.wearMultiplier}</dd>
   </dl>
   <p>Based on current buildings, condition, equipment and population. Farm food is potential output before storage limits. Changes to the estate and random events can alter results; this does not predict those events.</p>
  </>}
 </section>;
}
