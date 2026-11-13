// F29: the whole institution list as one module, so the picker fetches one lazy
// chunk (UK, US and world together) the first time it opens. Never imported
// statically: only through a plain import() in the pickers (see ModeFields.vue).
import uk from "./institutions-uk.json";
import us from "./institutions-us.json";
import world from "./institutions-world.json";
import { mergeInstitutions, pickerOptions } from "../lib/institutionList.js";

const { institutions, countries } = mergeInstitutions([uk, us, world]);
// institutions and countries for the email-domain suggestion; options for UiCombobox.
export default { institutions, countries, options: pickerOptions(institutions, countries) };
