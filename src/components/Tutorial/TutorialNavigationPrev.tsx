import React from 'react'
import tutorialPrev from '../../action-creators/tutorialPrev'
import { TUTORIAL_STEP_START } from '../../constants'
import store from '../../stores/app'
import TutorialNavigationButton from './TutorialNavigationButton'

// eslint-disable-next-line jsdoc/require-jsdoc
const TutorialNavigationPrev = ({ tutorialStep }: { tutorialStep: number }) => (
  <TutorialNavigationButton
    classes='tutorial-prev'
    disabled={tutorialStep === TUTORIAL_STEP_START}
    clickHandler={() => store.dispatch(tutorialPrev())}
    value='Prev'
  />
)

export default TutorialNavigationPrev