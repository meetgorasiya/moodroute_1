"""NLP Mood Detection using HuggingFace distilRoBERTa.

Classifies text into 7 emotions then maps to MoodRoute categories.
Falls back to keyword-based detection when the model is unavailable.
"""
import re


class MoodDetector:
    _instance = None
    _classifier = None
    _model_available = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load_model(self):
        # Already determined — don't retry regardless of outcome
        if self._model_available is not None:
            return

        if self._classifier is not None:
            return

        try:
            print('[NLP] Attempting to load distilRoBERTa emotion model...')

            # Disable all HuggingFace network retries before importing.
            # Without this, the library retries 5 times with 1+2+4+8+8s backoff
            # (~23 seconds minimum) before giving up when the network is unavailable.
            import os
            os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'

            # Monkey-patch huggingface_hub to use zero retries so failure is instant
            try:
                import huggingface_hub.file_download as hf_fd
                hf_fd._DEFAULT_RETRIES = 0
            except Exception:
                pass

            try:
                from huggingface_hub.utils._http import hf_raise_for_status
            except Exception:
                pass

            # Set a short network timeout so we don't wait long if the hub is unreachable
            import huggingface_hub
            if hasattr(huggingface_hub, 'constants'):
                try:
                    huggingface_hub.constants.HF_HUB_DOWNLOAD_TIMEOUT = 5
                except Exception:
                    pass

            from transformers import pipeline
            self._classifier = pipeline(
                'text-classification',
                model='j-hartmann/emotion-english-distilroberta-base',
                top_k=None,
                device=-1,
                # Use local cache only if available, don't block waiting for download
                local_files_only=not self._is_model_cached(),
            )
            MoodDetector._model_available = True
            self._model_available = True
            print('[NLP] ✓ distilRoBERTa model loaded successfully.')

        except Exception as load_error:
            # Permanently mark as unavailable on both instance and class level.
            # Setting on the class ensures even new instances skip the load attempt.
            MoodDetector._model_available = False
            self._model_available = False
            print(f'[NLP] Model unavailable ({type(load_error).__name__}). Using keyword fallback for all requests.')

    def _is_model_cached(self) -> bool:
        """Check if the distilRoBERTa model is already downloaded locally."""
        import os
        cache_dir = os.path.expanduser('~/.cache/huggingface/hub')
        if not os.path.exists(cache_dir):
            return False
        for entry in os.listdir(cache_dir):
            if 'distilroberta' in entry.lower() or 'hartmann' in entry.lower():
                return True
        return False

    def detect(self, mood_text: str) -> dict:
        """Detect mood from text input. Returns emotion, category, confidence, and scores."""
        self._load_model()

        if self._model_available and self._classifier is not None:
            return self._detect_with_model(mood_text)
        else:
            return self._detect_with_keywords(mood_text)

    def _detect_with_model(self, mood_text: str) -> dict:
        """Use HuggingFace distilRoBERTa for emotion detection."""
        classifier_results = self._classifier(mood_text[:512])[0]
        classifier_results.sort(key=lambda item: item['score'], reverse=True)

        top_emotion = classifier_results[0]['label']
        confidence = classifier_results[0]['score']
        all_emotion_scores = {result['label']: round(result['score'], 4) for result in classifier_results}

        mood_category = self._map_emotion_to_mood(top_emotion, all_emotion_scores)

        return {
            'detected_emotion': top_emotion,
            'mood_category': mood_category,
            'confidence': round(confidence, 3),
            'all_scores': all_emotion_scores,
            'description': self._get_mood_description(mood_category),
            'method': 'distilRoBERTa'
        }

    def _detect_with_keywords(self, mood_text: str) -> dict:
        """Keyword-based mood detection as fallback when model is unavailable."""
        lowered_text = mood_text.lower().strip()

        emotion_keywords = {
            'anger': {
                'angry': 2, 'furious': 3, 'frustrated': 2, 'irritated': 2,
                'annoyed': 2, 'rage': 3, 'mad': 2, 'pissed': 3,
                'hate': 2, 'fed up': 2, 'can\'t stand': 2
            },
            'disgust': {
                'disgusted': 3, 'gross': 2, 'sick of': 2, 'revolting': 3,
                'repulsed': 3, 'awful': 1, 'terrible': 1
            },
            'fear': {
                'afraid': 3, 'scared': 3, 'terrified': 3, 'anxious': 3,
                'anxiety': 3, 'worried': 2, 'nervous': 2, 'panic': 3,
                'dread': 3, 'uneasy': 2, 'restless': 2, 'fear': 3,
                'tense': 2, 'on edge': 2, 'freaking out': 3
            },
            'joy': {
                'happy': 3, 'great': 2, 'wonderful': 3, 'amazing': 3,
                'excited': 3, 'joyful': 3, 'love': 2, 'fantastic': 3,
                'good': 1, 'cheerful': 2, 'elated': 3, 'pleased': 2,
                'delighted': 3, 'thrilled': 3, 'blessed': 2, 'grateful': 2,
                'content': 2, 'brilliant': 2
            },
            'sadness': {
                'sad': 3, 'depressed': 3, 'unhappy': 2, 'upset': 2,
                'down': 2, 'low': 2, 'lonely': 3, 'grief': 3,
                'miss': 2, 'crying': 3, 'hopeless': 3, 'gloomy': 2,
                'miserable': 3, 'heartbroken': 3, 'empty': 2, 'numb': 2,
                'melancholy': 3
            },
            'surprise': {
                'surprised': 3, 'shocked': 3, 'amazed': 2, 'astonished': 3,
                'unexpected': 2, 'wow': 2, 'unbelievable': 2, 'can\'t believe': 2
            },
            'neutral': {}
        }

        stress_keywords = {
            'stressed': 3, 'overwhelmed': 3, 'pressure': 2, 'deadline': 2,
            'too much': 2, 'can\'t cope': 3, 'burnt out': 3, 'overworked': 3,
            'swamped': 2, 'drowning': 2, 'assignment': 1, 'exam': 1
        }

        tired_keywords = {
            'tired': 3, 'exhausted': 3, 'fatigue': 3, 'sleepy': 2,
            'drained': 3, 'no energy': 3, 'worn out': 3, 'lethargy': 3,
            'sluggish': 2, 'weary': 2, 'knackered': 3
        }

        energetic_keywords = {
            'energetic': 3, 'pumped': 3, 'motivated': 3, 'ready': 1,
            'active': 2, 'strong': 2, 'fired up': 3, 'let\'s go': 3,
            'enthusiastic': 3, 'alive': 2, 'vibrant': 2, 'buzzing': 2
        }

        emotion_scores = {emotion: 0 for emotion in emotion_keywords.keys()}
        emotion_scores['stressed_compound'] = 0
        emotion_scores['tired_compound'] = 0
        emotion_scores['energetic_compound'] = 0

        negation_patterns = [
            r'\bnot\s+', r'\bdon\'t\s+', r'\bdont\s+', r'\bno\s+',
            r'\bnever\s+', r'\bwithout\s+', r'\bhardly\s+'
        ]

        for emotion, keywords in emotion_keywords.items():
            for keyword, weight in keywords.items():
                if keyword in lowered_text:
                    is_negated = False
                    for negation_pattern in negation_patterns:
                        if re.search(negation_pattern + re.escape(keyword), lowered_text):
                            is_negated = True
                            break
                    if is_negated:
                        emotion_scores[emotion] -= weight
                    else:
                        emotion_scores[emotion] += weight

        for keyword, weight in stress_keywords.items():
            if keyword in lowered_text:
                emotion_scores['stressed_compound'] += weight
        for keyword, weight in tired_keywords.items():
            if keyword in lowered_text:
                emotion_scores['tired_compound'] += weight
        for keyword, weight in energetic_keywords.items():
            if keyword in lowered_text:
                emotion_scores['energetic_compound'] += weight

        # Compound moods take priority if strong enough
        if emotion_scores['stressed_compound'] >= 3:
            detected_emotion = 'anger'
            mood_category = 'stressed'
            top_score = emotion_scores['stressed_compound']
        elif emotion_scores['tired_compound'] >= 3:
            detected_emotion = 'neutral'
            mood_category = 'tired'
            top_score = emotion_scores['tired_compound']
        elif emotion_scores['energetic_compound'] >= 3:
            detected_emotion = 'surprise'
            mood_category = 'energetic'
            top_score = emotion_scores['energetic_compound']
        else:
            base_emotion_scores = {emotion: score for emotion, score in emotion_scores.items()
                                   if emotion in emotion_keywords and emotion != 'neutral'}
            if any(score > 0 for score in base_emotion_scores.values()):
                detected_emotion = max(base_emotion_scores, key=base_emotion_scores.get)
                top_score = base_emotion_scores[detected_emotion]
            else:
                detected_emotion = 'neutral'
                top_score = 1

            mood_category = self._map_emotion_to_mood(
                detected_emotion,
                {emotion: max(0, score) / max(1, sum(max(0, s) for s in emotion_scores.values()))
                 for emotion, score in emotion_scores.items() if emotion in emotion_keywords}
            )

        total_weight = sum(max(0, score) for score in emotion_scores.values()) + 1
        confidence = min(0.85, 0.45 + (top_score / total_weight) * 0.4)

        all_emotions = ['anger', 'disgust', 'fear', 'joy', 'neutral', 'sadness', 'surprise']
        all_emotion_scores = {}
        for emotion_name in all_emotions:
            raw_score = max(0, emotion_scores.get(emotion_name, 0))
            all_emotion_scores[emotion_name] = round(raw_score / max(1, total_weight), 4)

        return {
            'detected_emotion': detected_emotion,
            'mood_category': mood_category,
            'confidence': round(confidence, 3),
            'all_scores': all_emotion_scores,
            'description': self._get_mood_description(mood_category),
            'method': 'keyword_fallback'
        }

    def _map_emotion_to_mood(self, emotion: str, scores: dict) -> str:
        """Map distilRoBERTa emotions to MoodRoute mood categories.
        
        Handles compound emotions (e.g. sadness + anger = stressed)
        and low-affect states (neutral + slight sadness = tired).
        """
        if scores.get('sadness', 0) > 0.25 and scores.get('anger', 0) > 0.2:
            return 'stressed'

        if emotion == 'neutral' and scores.get('sadness', 0) > 0.15:
            return 'tired'

        if emotion == 'neutral' and scores.get('joy', 0) > 0.15:
            return 'happy'

        emotion_to_mood = {
            'anger': 'stressed',
            'disgust': 'stressed',
            'fear': 'anxious',
            'sadness': 'sad',
            'joy': 'happy',
            'surprise': 'energetic',
            'neutral': 'neutral'
        }

        return emotion_to_mood.get(emotion, 'neutral')

    def _get_mood_description(self, mood: str) -> str:
        descriptions = {
            'stressed': 'Quiet, green, and calming routes to help you decompress',
            'anxious': 'Very quiet, secluded paths with minimal stimulation',
            'tired': 'Short, flat, gentle walks to restore your energy',
            'sad': 'Nature-rich uplifting routes to lift your spirits',
            'happy': 'Scenic enjoyable routes to celebrate your mood',
            'energetic': 'Long, challenging routes to channel your energy',
            'neutral': 'Balanced, well-rounded walking routes'
        }
        return descriptions.get(mood, descriptions['neutral'])
