#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include "BackendClient.h"

class YT2MP3AudioProcessor : public juce::AudioProcessor,
                             public juce::ChangeListener
{
public:
    YT2MP3AudioProcessor();
    ~YT2MP3AudioProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    void changeListenerCallback(juce::ChangeBroadcaster* source) override;

    BackendClient& getBackendClient() { return backendClient; }
    juce::AudioFormatManager& getFormatManager() { return formatManager; }

    void playPreview(const juce::File& file);
    void stopPreview();
    bool isPlayingPreview() const { return transportSource.isPlaying(); }

private:
    BackendClient backendClient;
    juce::AudioFormatManager formatManager;
    juce::AudioTransportSource transportSource;
    std::unique_ptr<juce::AudioFormatReaderSource> currentReaderSource;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(YT2MP3AudioProcessor)
};
