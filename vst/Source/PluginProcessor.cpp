#include "PluginProcessor.h"
#include "PluginEditor.h"

YT2MP3AudioProcessor::YT2MP3AudioProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
    : AudioProcessor(BusesProperties()
#if !JucePlugin_IsMidiEffect
#if !JucePlugin_IsSynth
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
#endif
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)
#endif
      )
#endif
{
    formatManager.registerBasicFormats();
    transportSource.addChangeListener(this);
}

YT2MP3AudioProcessor::~YT2MP3AudioProcessor()
{
    transportSource.removeChangeListener(this);
    transportSource.setSource(nullptr);
}

const juce::String YT2MP3AudioProcessor::getName() const
{
    return JucePlugin_Name;
}

bool YT2MP3AudioProcessor::acceptsMidi() const
{
#if JucePlugin_WantsMidiInput
    return true;
#else
    return false;
#endif
}

bool YT2MP3AudioProcessor::producesMidi() const
{
#if JucePlugin_ProducesMidiOutput
    return true;
#else
    return false;
#endif
}

bool YT2MP3AudioProcessor::isMidiEffect() const
{
#if JucePlugin_IsMidiEffect
    return true;
#else
    return false;
#endif
}

double YT2MP3AudioProcessor::getTailLengthSeconds() const
{
    return 0.0;
}

int YT2MP3AudioProcessor::getNumPrograms()
{
    return 1;
}

int YT2MP3AudioProcessor::getCurrentProgram()
{
    return 0;
}

void YT2MP3AudioProcessor::setCurrentProgram(int)
{
}

const juce::String YT2MP3AudioProcessor::getProgramName(int)
{
    return {};
}

void YT2MP3AudioProcessor::changeProgramName(int, const juce::String&)
{
}

void YT2MP3AudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    transportSource.prepareToPlay(samplesPerBlock, sampleRate);
}

void YT2MP3AudioProcessor::releaseResources()
{
    transportSource.releaseResources();
}

#ifndef JucePlugin_PreferredChannelConfigurations
bool YT2MP3AudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
#if JucePlugin_IsMidiEffect
    juce::ignoreUnused(layouts);
    return true;
#else
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
     && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

#if !JucePlugin_IsSynth
    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;
#endif

    return true;
#endif
}
#endif

void YT2MP3AudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ignoreUnused(midiMessages);
    juce::ScopedNoDenormals noDenormals;

    auto totalNumInputChannels = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear(i, 0, buffer.getNumSamples());

    // Mix in preview transport source if playing
    if (transportSource.isPlaying())
    {
        transportSource.getNextAudioBlock(juce::AudioSourceChannelInfo(buffer));
    }
}

void YT2MP3AudioProcessor::playPreview(const juce::File& file)
{
    if (!file.existsAsFile())
        return;

    stopPreview();

    auto* reader = formatManager.createReaderFor(file);
    if (reader != nullptr)
    {
        currentReaderSource = std::make_unique<juce::AudioFormatReaderSource>(reader, true);
        transportSource.setSource(currentReaderSource.get(), 0, nullptr, reader->sampleRate);
        transportSource.setPosition(0.0);
        transportSource.start();
    }
}

void YT2MP3AudioProcessor::stopPreview()
{
    transportSource.stop();
    transportSource.setSource(nullptr);
    currentReaderSource.reset();
}

void YT2MP3AudioProcessor::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    if (source == &transportSource)
    {
        if (!transportSource.isPlaying())
        {
            // Playback completed or stopped
        }
    }
}

bool YT2MP3AudioProcessor::hasEditor() const
{
    return true;
}

juce::AudioProcessorEditor* YT2MP3AudioProcessor::createEditor()
{
    return new YT2MP3AudioProcessorEditor(*this);
}

void YT2MP3AudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ignoreUnused(destData);
}

void YT2MP3AudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::ignoreUnused(data, sizeInBytes);
}

// Create plugin instance
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new YT2MP3AudioProcessor();
}
